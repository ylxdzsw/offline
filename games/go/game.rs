use goban::pieces::stones::{Color, Stone};
use goban::rules::game::Game;
use goban::rules::{CHINESE, EndGame, GobanSizes, Move, PlayError};

pub const EMPTY: u8 = 0;
pub const BLACK: u8 = 1;
pub const WHITE: u8 = 2;
pub const KOMI: f32 = 7.5;
pub const SIZES: [u8; 3] = [9, 13, 19];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Record {
    Play(u16),
    Pass,
    Resign,
}

#[derive(Clone, Debug)]
pub struct Position {
    pub game: Game,
    pub records: Vec<Record>,
    pub resigned: Option<Color>,
    pub size: u8,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Outcome {
    pub ended: bool,
    pub winner: Option<u8>,
    pub reason: &'static str,
    pub black_score: f32,
    pub white_score: f32,
    pub margin: Option<f32>,
}

impl Position {
    pub fn from_records(size: u8, records: &[Record]) -> Result<Self, String> {
        let mut position = Self {
            game: Game::new(goban_size(size)?, CHINESE),
            records: Vec::with_capacity(records.len()),
            resigned: None,
            size,
        };
        for record in records {
            if position.resigned.is_some() || position.game.is_over() {
                return Err("moves cannot follow the end of the game".to_string());
            }
            match *record {
                Record::Play(index) => position.try_play(index)?,
                Record::Pass => position.pass()?,
                Record::Resign => position.resign(),
            }
        }
        Ok(position)
    }

    pub fn board(&self) -> Vec<u8> {
        (0..self.area())
            .map(|index| {
                let coord = self.coord(index as u16);
                self.game
                    .goban()
                    .get_color(coord)
                    .map_or(EMPTY, color_number)
            })
            .collect()
    }

    pub fn area(&self) -> usize {
        self.size as usize * self.size as usize
    }

    pub fn coord(&self, index: u16) -> (u8, u8) {
        (
            (index / self.size as u16) as u8,
            (index % self.size as u16) as u8,
        )
    }

    pub fn index(&self, coord: (u8, u8)) -> u16 {
        coord.0 as u16 * self.size as u16 + coord.1 as u16
    }

    pub fn turn(&self) -> u8 {
        color_number(self.game.turn())
    }

    pub fn legal_moves(&self) -> Vec<u16> {
        if self.resigned.is_some() || self.game.is_over() {
            return Vec::new();
        }
        self.game.legals().map(|coord| self.index(coord)).collect()
    }

    pub fn check_move(&self, index: u16) -> Result<(), &'static str> {
        if self.resigned.is_some() || self.game.is_over() {
            return Err("ended");
        }
        if index as usize >= self.area() {
            return Err("outside");
        }
        let stone = Stone {
            coord: self.coord(index),
            color: self.game.turn(),
        };
        if self.game.will_capture(stone.coord)
            && (self.game.check_ko(stone) || self.game.check_super_ko(stone))
        {
            return Err("ko");
        }
        self.game
            .check_point(self.coord(index))
            .map_or(Ok(()), |error| Err(play_error(error)))
    }

    pub fn try_play(&mut self, index: u16) -> Result<(), String> {
        self.check_move(index).map_err(str::to_string)?;
        self.game
            .try_play(Move::from(self.coord(index)))
            .map_err(|error| play_error(error).to_string())?;
        self.records.push(Record::Play(index));
        Ok(())
    }

    pub fn pass(&mut self) -> Result<(), String> {
        if self.resigned.is_some() || self.game.is_over() {
            return Err("the game has ended".to_string());
        }
        self.game
            .try_play(Move::Pass)
            .map_err(|error| play_error(error).to_string())?;
        self.records.push(Record::Pass);
        Ok(())
    }

    pub fn resign(&mut self) {
        self.resigned = Some(self.game.turn());
        self.records.push(Record::Resign);
    }

    pub fn pass_count(&self) -> u8 {
        self.records
            .iter()
            .rev()
            .take_while(|record| **record == Record::Pass)
            .count()
            .min(2) as u8
    }

    pub fn captures(&self) -> (u32, u32) {
        self.game.prisoners()
    }

    pub fn score(&self) -> (f32, f32) {
        self.game.calculate_score()
    }

    pub fn outcome(&self) -> Outcome {
        let (black_score, white_score) = self.score();
        if let Some(resigned) = self.resigned {
            return Outcome {
                ended: true,
                winner: Some(color_number(!resigned)),
                reason: "resign",
                black_score,
                white_score,
                margin: None,
            };
        }
        let Some(result) = self.game.outcome() else {
            return Outcome {
                ended: false,
                winner: None,
                reason: "playing",
                black_score,
                white_score,
                margin: None,
            };
        };
        let (winner, margin) = match result {
            EndGame::WinnerByScore(color, margin) => (Some(color_number(color)), Some(margin)),
            EndGame::Draw => (None, Some(0.0)),
            EndGame::WinnerByResign(color)
            | EndGame::WinnerByTime(color)
            | EndGame::WinnerByForfeit(color) => (Some(color_number(color)), None),
        };
        Outcome {
            ended: true,
            winner,
            reason: "passes",
            black_score,
            white_score,
            margin,
        }
    }
}

pub const fn color_number(color: Color) -> u8 {
    match color {
        Color::Black => BLACK,
        Color::White => WHITE,
    }
}

fn goban_size(size: u8) -> Result<GobanSizes, String> {
    match size {
        9 => Ok(GobanSizes::Nine),
        13 => Ok(GobanSizes::Thirteen),
        19 => Ok(GobanSizes::Nineteen),
        _ => Err("size must be 9, 13, or 19".to_string()),
    }
}

fn play_error(error: PlayError) -> &'static str {
    match error {
        PlayError::Ko => "ko",
        PlayError::Suicide => "suicide",
        PlayError::GamePaused => "ended",
        PlayError::FillEye => "eye",
        PlayError::PointNotEmpty => "occupied",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn play(position: &mut Position, row: u16, column: u16) {
        position
            .try_play(row * position.size as u16 + column)
            .unwrap();
    }

    #[test]
    fn supports_standard_sizes_and_defaults_to_chinese_scoring() {
        for size in SIZES {
            let position = Position::from_records(size, &[]).unwrap();
            assert_eq!(position.board(), vec![EMPTY; size as usize * size as usize]);
            assert_eq!(position.turn(), BLACK);
            assert_eq!(position.score(), (0.0, KOMI));
        }
    }

    #[test]
    fn capture_removes_stone_and_suicide_is_illegal() {
        let mut position = Position::from_records(9, &[]).unwrap();
        play(&mut position, 0, 1);
        play(&mut position, 1, 1);
        play(&mut position, 1, 0);
        position.pass().unwrap();
        play(&mut position, 1, 2);
        position.pass().unwrap();
        play(&mut position, 2, 1);

        assert_eq!(position.board()[10], EMPTY);
        assert_eq!(position.captures(), (1, 0));
        assert_eq!(position.check_move(10), Err("suicide"));
    }

    #[test]
    fn immediate_ko_recapture_is_illegal() {
        let records = [
            Record::Play(3),
            Record::Play(2),
            Record::Play(23),
            Record::Play(40),
            Record::Play(41),
            Record::Play(20),
            Record::Play(21),
            Record::Play(22),
        ];
        let position = Position::from_records(19, &records).unwrap();
        assert_eq!(position.check_move(21), Err("ko"));
    }

    #[test]
    fn two_passes_end_and_score_the_board() {
        let position = Position::from_records(9, &[Record::Pass, Record::Pass]).unwrap();
        let outcome = position.outcome();
        assert!(outcome.ended);
        assert_eq!(outcome.winner, Some(WHITE));
        assert_eq!(outcome.reason, "passes");
        assert_eq!(outcome.margin, Some(KOMI));
    }

    #[test]
    fn records_after_an_outcome_are_rejected() {
        assert!(Position::from_records(9, &[Record::Pass, Record::Pass, Record::Play(0)]).is_err());
        assert!(Position::from_records(9, &[Record::Resign, Record::Play(0)]).is_err());
    }
}
