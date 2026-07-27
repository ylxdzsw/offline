use std::collections::{HashSet, VecDeque};

use serde::Serialize;

use crate::game::{self, PIECES, Slide};

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
struct State {
    cao_cao: u8,
    guan_yu: u8,
    generals: [u8; 4],
    soldiers: [u8; 4],
}

impl State {
    fn from_positions(positions: &[u8]) -> Result<Self, String> {
        game::validate(positions)?;
        let mut generals: [u8; 4] = positions[2..6]
            .try_into()
            .expect("validated positions contain four generals");
        let mut soldiers: [u8; 4] = positions[6..10]
            .try_into()
            .expect("validated positions contain four soldiers");
        generals.sort_unstable();
        soldiers.sort_unstable();
        Ok(Self {
            cao_cao: positions[0],
            guan_yu: positions[1],
            generals,
            soldiers,
        })
    }

    fn positions(self) -> [u8; PIECES] {
        [
            self.cao_cao,
            self.guan_yu,
            self.generals[0],
            self.generals[1],
            self.generals[2],
            self.generals[3],
            self.soldiers[0],
            self.soldiers[1],
            self.soldiers[2],
            self.soldiers[3],
        ]
    }

    fn after(self, piece: usize, to: u8) -> Self {
        let mut positions = self.positions();
        positions[piece] = to;
        Self::from_positions(&positions).expect("generated moves preserve a valid state")
    }

    fn solved(self) -> bool {
        self.cao_cao == game::GOAL
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub struct SearchResult {
    #[serde(rename = "move")]
    pub selected: Option<Slide>,
    pub distance: Option<u16>,
    pub nodes: usize,
}

pub fn shortest_hint(positions: &[u8]) -> Result<SearchResult, String> {
    let initial = State::from_positions(positions)?;
    if initial.solved() {
        return Ok(SearchResult {
            selected: None,
            distance: Some(0),
            nodes: 1,
        });
    }

    let mut queue = VecDeque::from([(initial, None, 0_u16)]);
    let mut visited = HashSet::from([initial]);
    let mut nodes = 0;
    while let Some((state, first, depth)) = queue.pop_front() {
        nodes += 1;
        let positions = state.positions();
        for piece in 0..PIECES {
            for slide in game::legal_moves(&positions, piece)? {
                let next = state.after(piece, slide.to);
                if !visited.insert(next) {
                    continue;
                }
                let first = first.or(Some(slide));
                let distance = depth
                    .checked_add(1)
                    .ok_or_else(|| "solution distance overflow".to_owned())?;
                if next.solved() {
                    return Ok(SearchResult {
                        selected: first,
                        distance: Some(distance),
                        nodes,
                    });
                }
                queue.push_back((next, first, distance));
            }
        }
    }

    Ok(SearchResult {
        selected: None,
        distance: None,
        nodes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn curated_layouts_have_increasing_optimal_distances() {
        let result = shortest_hint(&game::layout("easy").unwrap().positions).unwrap();
        assert_eq!(result.distance, Some(64));
        let result = shortest_hint(&game::layout("medium").unwrap().positions).unwrap();
        assert_eq!(result.distance, Some(68));
    }

    #[test]
    fn classic_layout_has_a_legal_optimal_hint() {
        let positions = game::layout("hard").unwrap().positions;
        let result = shortest_hint(&positions).unwrap();
        let selected = result.selected.expect("classic layout is solvable");
        assert_eq!(result.distance, Some(90));
        let piece = positions
            .iter()
            .position(|position| *position == selected.from)
            .expect("hint begins at an occupied top-left position");
        assert!(
            game::legal_moves(&positions, piece)
                .unwrap()
                .contains(&selected)
        );
    }
}
