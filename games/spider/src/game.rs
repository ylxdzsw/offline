use serde::{Deserialize, Serialize};

pub const TABLEAU_COLUMNS: usize = 10;
pub const CARDS: usize = 104;
pub const RUN_LENGTH: usize = 13;
pub const RUNS_TO_WIN: usize = 8;

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct TableauPile {
    pub hidden: Vec<u8>,
    pub visible: Vec<u8>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Game {
    pub suit_count: u8,
    pub stock: Vec<u8>,
    pub completed: Vec<Vec<u8>>,
    pub tableau: Vec<TableauPile>,
    pub won: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize)]
pub struct Source {
    pub column: usize,
    pub card: usize,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize)]
pub struct Destination {
    pub column: usize,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct ActionResult {
    pub game: Game,
    pub moved: bool,
    pub flipped: bool,
    pub completed: usize,
    pub reason: Option<&'static str>,
}

pub fn rank(card: u8) -> u8 {
    card % RUN_LENGTH as u8
}

pub fn suit(card: u8, suit_count: u8) -> u8 {
    match suit_count {
        1 => 3,
        2 => [3, 2][usize::from(card / RUN_LENGTH as u8) % 2],
        4 => (card / RUN_LENGTH as u8) % 4,
        _ => unreachable!("suit count is validated before cards are inspected"),
    }
}

fn mix(mut value: u64) -> u64 {
    value ^= value >> 30;
    value = value.wrapping_mul(0xbf58_476d_1ce4_e5b9);
    value ^= value >> 27;
    value = value.wrapping_mul(0x94d0_49bb_1331_11eb);
    value ^ (value >> 31)
}

fn shuffled_deck(seed: u64) -> Vec<u8> {
    let mut deck: Vec<_> = (0..CARDS as u8).collect();
    let mut state = seed;
    for index in (1..deck.len()).rev() {
        state = state.wrapping_add(0x9e37_79b9_7f4a_7c15);
        let destination = (mix(state) % (index as u64 + 1)) as usize;
        deck.swap(index, destination);
    }
    deck
}

pub fn new_game(seed: u64, suit_count: u8) -> Result<Game, String> {
    if !matches!(suit_count, 1 | 2 | 4) {
        return Err("suit count must be 1, 2, or 4".to_owned());
    }
    let mut deck = shuffled_deck(seed);
    let mut tableau = (0..TABLEAU_COLUMNS)
        .map(|_| TableauPile {
            hidden: Vec::new(),
            visible: Vec::new(),
        })
        .collect::<Vec<_>>();

    for _ in 0..4 {
        for pile in &mut tableau {
            pile.hidden
                .push(deck.pop().expect("a full deck contains the opening deal"));
        }
    }
    for pile in tableau.iter_mut().take(4) {
        pile.hidden
            .push(deck.pop().expect("a full deck contains the opening deal"));
    }
    for pile in &mut tableau {
        pile.visible
            .push(deck.pop().expect("a full deck contains the opening deal"));
    }

    let game = Game {
        suit_count,
        stock: deck,
        completed: Vec::new(),
        tableau,
        won: false,
    };
    validate(&game)?;
    Ok(game)
}

fn is_complete_run(cards: &[u8], suit_count: u8) -> bool {
    cards.len() == RUN_LENGTH
        && cards
            .iter()
            .enumerate()
            .all(|(index, card)| usize::from(rank(*card)) == RUN_LENGTH - 1 - index)
        && cards
            .windows(2)
            .all(|pair| suit(pair[0], suit_count) == suit(pair[1], suit_count))
}

fn is_movable_run(cards: &[u8], suit_count: u8) -> bool {
    !cards.is_empty()
        && cards.windows(2).all(|pair| {
            rank(pair[1]) + 1 == rank(pair[0])
                && suit(pair[0], suit_count) == suit(pair[1], suit_count)
        })
}

pub fn validate(game: &Game) -> Result<(), String> {
    if !matches!(game.suit_count, 1 | 2 | 4) {
        return Err("suit count must be 1, 2, or 4".to_owned());
    }
    if game.tableau.len() != TABLEAU_COLUMNS {
        return Err("there must be ten tableau columns".to_owned());
    }
    if !game.stock.len().is_multiple_of(TABLEAU_COLUMNS) {
        return Err("the stock must contain complete ten-card deals".to_owned());
    }
    if game.completed.len() > RUNS_TO_WIN {
        return Err("there cannot be more than eight completed runs".to_owned());
    }
    if game
        .completed
        .iter()
        .any(|run| !is_complete_run(run, game.suit_count))
    {
        return Err("completed runs must descend from king to ace in one suit".to_owned());
    }

    let mut seen = [false; CARDS];
    let mut count = 0;
    let mut record = |card: u8| -> Result<(), String> {
        let index = usize::from(card);
        if index >= CARDS {
            return Err(format!("card {card} is out of range"));
        }
        if seen[index] {
            return Err(format!("card {card} appears more than once"));
        }
        seen[index] = true;
        count += 1;
        Ok(())
    };

    for card in &game.stock {
        record(*card)?;
    }
    for run in &game.completed {
        for card in run {
            record(*card)?;
        }
    }
    for pile in &game.tableau {
        if !pile.hidden.is_empty() && pile.visible.is_empty() {
            return Err("a non-empty tableau pile must expose its top card".to_owned());
        }
        for card in pile.hidden.iter().chain(&pile.visible) {
            record(*card)?;
        }
    }
    if count != CARDS || seen.iter().any(|present| !present) {
        return Err("a game must contain every card exactly once".to_owned());
    }

    let won = game.completed.len() == RUNS_TO_WIN;
    if game.won != won {
        return Err("won flag does not match the completed runs".to_owned());
    }
    Ok(())
}

fn unchanged(game: Game, reason: &'static str) -> ActionResult {
    ActionResult {
        game,
        moved: false,
        flipped: false,
        completed: 0,
        reason: Some(reason),
    }
}

fn expose_top(pile: &mut TableauPile) -> bool {
    if pile.visible.is_empty()
        && let Some(card) = pile.hidden.pop()
    {
        pile.visible.push(card);
        return true;
    }
    false
}

fn collect_complete_runs(game: &mut Game) -> (usize, bool) {
    let mut completed = 0;
    let mut flipped = false;
    for pile in &mut game.tableau {
        if pile.visible.len() < RUN_LENGTH {
            continue;
        }
        let start = pile.visible.len() - RUN_LENGTH;
        if is_complete_run(&pile.visible[start..], game.suit_count) {
            game.completed.push(pile.visible.split_off(start));
            completed += 1;
            flipped |= expose_top(pile);
        }
    }
    game.won = game.completed.len() == RUNS_TO_WIN;
    (completed, flipped)
}

pub fn move_cards(
    mut game: Game,
    source: Source,
    destination: Destination,
) -> Result<ActionResult, String> {
    validate(&game)?;
    if source.column >= TABLEAU_COLUMNS || destination.column >= TABLEAU_COLUMNS {
        return Err("tableau column is out of range".to_owned());
    }
    if source.column == destination.column {
        return Ok(unchanged(game, "invalidMove"));
    }
    let source_pile = &game.tableau[source.column];
    if source.card >= source_pile.visible.len() {
        return Err("tableau card is out of range".to_owned());
    }
    let cards = &source_pile.visible[source.card..];
    if !is_movable_run(cards, game.suit_count) {
        return Ok(unchanged(game, "mixedRun"));
    }
    let destination_pile = &game.tableau[destination.column];
    if destination_pile
        .visible
        .last()
        .is_some_and(|top| rank(cards[0]) + 1 != rank(*top))
    {
        return Ok(unchanged(game, "invalidMove"));
    }

    let cards = game.tableau[source.column].visible.split_off(source.card);
    game.tableau[destination.column].visible.extend(cards);
    let mut flipped = expose_top(&mut game.tableau[source.column]);
    let (completed, completion_flip) = collect_complete_runs(&mut game);
    flipped |= completion_flip;
    validate(&game)?;
    Ok(ActionResult {
        game,
        moved: true,
        flipped,
        completed,
        reason: None,
    })
}

pub fn deal_stock(mut game: Game) -> Result<ActionResult, String> {
    validate(&game)?;
    if game.stock.is_empty() {
        return Ok(unchanged(game, "stockEmpty"));
    }
    if game
        .tableau
        .iter()
        .any(|pile| pile.hidden.is_empty() && pile.visible.is_empty())
    {
        return Ok(unchanged(game, "emptyColumn"));
    }
    if game.stock.len() < TABLEAU_COLUMNS {
        return Err("the stock does not contain a complete deal".to_owned());
    }

    for pile in &mut game.tableau {
        pile.visible
            .push(game.stock.pop().expect("the stock has a complete deal"));
    }
    let (completed, flipped) = collect_complete_runs(&mut game);
    validate(&game)?;
    Ok(ActionResult {
        game,
        moved: true,
        flipped,
        completed,
        reason: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn nearly_won() -> Game {
        let completed = (0..7)
            .map(|group| {
                (0..RUN_LENGTH)
                    .rev()
                    .map(|rank| (group * RUN_LENGTH + rank) as u8)
                    .collect()
            })
            .collect();
        let mut tableau = (0..TABLEAU_COLUMNS)
            .map(|_| TableauPile {
                hidden: Vec::new(),
                visible: Vec::new(),
            })
            .collect::<Vec<_>>();
        tableau[0].visible = (1..RUN_LENGTH)
            .rev()
            .map(|rank| (7 * RUN_LENGTH + rank) as u8)
            .collect();
        tableau[1].visible.push((7 * RUN_LENGTH) as u8);
        Game {
            suit_count: 1,
            stock: Vec::new(),
            completed,
            tableau,
            won: false,
        }
    }

    #[test]
    fn deal_is_deterministic_and_uses_the_digital_layout() {
        let game = new_game(42, 4).unwrap();
        assert_eq!(game, new_game(42, 4).unwrap());
        assert_ne!(game, new_game(43, 4).unwrap());
        assert_eq!(game.stock.len(), 50);
        assert_eq!(
            game.tableau
                .iter()
                .map(|pile| pile.hidden.len())
                .collect::<Vec<_>>(),
            vec![5, 5, 5, 5, 4, 4, 4, 4, 4, 4]
        );
        assert!(game.tableau.iter().all(|pile| pile.visible.len() == 1));
        validate(&game).unwrap();
    }

    #[test]
    fn suit_modes_have_the_expected_distribution() {
        for (suit_count, expected) in [
            (1, vec![0, 0, 0, 8]),
            (2, vec![0, 0, 4, 4]),
            (4, vec![2, 2, 2, 2]),
        ] {
            let mut copies = vec![0; 4];
            for card in 0..CARDS as u8 {
                if rank(card) == 0 {
                    copies[usize::from(suit(card, suit_count))] += 1;
                }
            }
            assert_eq!(copies, expected);
        }
    }

    #[test]
    fn mixed_suit_sequences_cannot_move_together() {
        let game = new_game(7, 4).unwrap();
        assert!(!is_movable_run(&[12, 24], game.suit_count));
        assert!(is_movable_run(&[12, 11, 10], game.suit_count));
    }

    #[test]
    fn a_stock_deal_adds_one_card_to_every_column() {
        let game = new_game(9, 2).unwrap();
        let before = game
            .tableau
            .iter()
            .map(|pile| pile.visible.len())
            .collect::<Vec<_>>();
        let result = deal_stock(game).unwrap();
        assert!(result.moved);
        assert_eq!(result.game.stock.len(), 40);
        for (pile, previous) in result.game.tableau.iter().zip(before) {
            assert_eq!(pile.visible.len(), previous + 1);
        }
        validate(&result.game).unwrap();
    }

    #[test]
    fn stock_deals_are_blocked_while_a_column_is_empty() {
        let mut game = new_game(11, 1).unwrap();
        let moved = game.tableau[0].visible.pop().unwrap();
        game.tableau[1].visible.push(moved);
        let hidden = game.tableau[0].hidden.drain(..).collect::<Vec<_>>();
        game.tableau[1].hidden.extend(hidden);
        validate(&game).unwrap();
        let result = deal_stock(game.clone()).unwrap();
        assert!(!result.moved);
        assert_eq!(result.reason, Some("emptyColumn"));
        assert_eq!(result.game, game);
    }

    #[test]
    fn final_ace_collects_the_eighth_run_and_wins() {
        let game = nearly_won();
        validate(&game).unwrap();
        let result = move_cards(
            game,
            Source { column: 1, card: 0 },
            Destination { column: 0 },
        )
        .unwrap();
        assert!(result.moved);
        assert_eq!(result.completed, 1);
        assert!(result.game.won);
        assert_eq!(result.game.completed.len(), 8);
        validate(&result.game).unwrap();
    }

    #[test]
    fn validation_rejects_duplicate_cards() {
        let mut game = new_game(12, 4).unwrap();
        game.stock[0] = game.stock[1];
        assert!(validate(&game).is_err());
    }
}
