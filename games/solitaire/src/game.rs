use serde::{Deserialize, Serialize};

pub const SUITS: usize = 4;
pub const TABLEAU_COLUMNS: usize = 7;
pub const CARDS: usize = 52;

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct TableauPile {
    pub hidden: Vec<u8>,
    pub visible: Vec<u8>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Game {
    pub draw_count: u8,
    pub stock: Vec<u8>,
    pub waste: Vec<u8>,
    pub foundations: Vec<Vec<u8>>,
    pub tableau: Vec<TableauPile>,
    pub won: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Source {
    Waste,
    Tableau { column: usize, card: usize },
    Foundation { suit: usize },
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Destination {
    Tableau { column: usize },
    Foundation { suit: usize },
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct MoveResult {
    pub game: Game,
    pub moved: bool,
    pub flipped: bool,
}

fn rank(card: u8) -> u8 {
    card % 13 + 1
}

fn suit(card: u8) -> usize {
    usize::from(card / 13)
}

fn is_red(card: u8) -> bool {
    matches!(suit(card), 1 | 2)
}

fn can_stack(card: u8, destination: u8) -> bool {
    rank(card) + 1 == rank(destination) && is_red(card) != is_red(destination)
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

pub fn new_game(seed: u64, draw_count: u8) -> Result<Game, String> {
    if !matches!(draw_count, 1 | 3) {
        return Err("draw count must be 1 or 3".to_owned());
    }
    let mut deck = shuffled_deck(seed);
    let mut tableau = (0..TABLEAU_COLUMNS)
        .map(|_| TableauPile {
            hidden: Vec::new(),
            visible: Vec::new(),
        })
        .collect::<Vec<_>>();

    for row in 0..TABLEAU_COLUMNS {
        for (column, pile) in tableau.iter_mut().enumerate().skip(row) {
            let card = deck.pop().expect("a full deck contains the tableau");
            if row == column {
                pile.visible.push(card);
            } else {
                pile.hidden.push(card);
            }
        }
    }

    let game = Game {
        draw_count,
        stock: deck,
        waste: Vec::new(),
        foundations: vec![Vec::new(); SUITS],
        tableau,
        won: false,
    };
    validate(&game)?;
    Ok(game)
}

pub fn validate(game: &Game) -> Result<(), String> {
    if !matches!(game.draw_count, 1 | 3) {
        return Err("draw count must be 1 or 3".to_owned());
    }
    if game.foundations.len() != SUITS {
        return Err("there must be four foundations".to_owned());
    }
    if game.tableau.len() != TABLEAU_COLUMNS {
        return Err("there must be seven tableau columns".to_owned());
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

    for card in game.stock.iter().chain(&game.waste) {
        record(*card)?;
    }
    for (foundation_suit, foundation) in game.foundations.iter().enumerate() {
        for (index, card) in foundation.iter().enumerate() {
            if suit(*card) != foundation_suit || usize::from(rank(*card)) != index + 1 {
                return Err("foundation cards must rise from ace in suit".to_owned());
            }
            record(*card)?;
        }
    }
    for pile in &game.tableau {
        if !pile.hidden.is_empty() && pile.visible.is_empty() {
            return Err("a non-empty tableau pile must expose its top card".to_owned());
        }
        if pile
            .visible
            .windows(2)
            .any(|pair| !can_stack(pair[1], pair[0]))
        {
            return Err("visible tableau cards must descend in alternating colors".to_owned());
        }
        for card in pile.hidden.iter().chain(&pile.visible) {
            record(*card)?;
        }
    }
    if count != CARDS || seen.iter().any(|present| !present) {
        return Err("a game must contain every card exactly once".to_owned());
    }
    let won = game
        .foundations
        .iter()
        .all(|foundation| foundation.len() == 13);
    if game.won != won {
        return Err("won flag does not match the foundations".to_owned());
    }
    Ok(())
}

fn unchanged(game: Game) -> MoveResult {
    MoveResult {
        game,
        moved: false,
        flipped: false,
    }
}

pub fn draw(mut game: Game) -> Result<MoveResult, String> {
    validate(&game)?;
    if game.stock.is_empty() {
        if game.waste.is_empty() {
            return Ok(unchanged(game));
        }
        game.stock.extend(game.waste.drain(..).rev());
        return Ok(MoveResult {
            game,
            moved: true,
            flipped: false,
        });
    }

    for _ in 0..game.draw_count {
        let Some(card) = game.stock.pop() else {
            break;
        };
        game.waste.push(card);
    }
    Ok(MoveResult {
        game,
        moved: true,
        flipped: false,
    })
}

fn source_cards(game: &Game, source: &Source) -> Result<Vec<u8>, String> {
    match source {
        Source::Waste => Ok(game.waste.last().copied().into_iter().collect()),
        Source::Tableau { column, card } => {
            let pile = game
                .tableau
                .get(*column)
                .ok_or_else(|| "tableau source is out of range".to_owned())?;
            if *card >= pile.visible.len() {
                return Err("tableau card is out of range".to_owned());
            }
            Ok(pile.visible[*card..].to_vec())
        }
        Source::Foundation { suit } => {
            let foundation = game
                .foundations
                .get(*suit)
                .ok_or_else(|| "foundation source is out of range".to_owned())?;
            Ok(foundation.last().copied().into_iter().collect())
        }
    }
}

fn legal_destination(
    game: &Game,
    cards: &[u8],
    source: &Source,
    destination: &Destination,
) -> Result<bool, String> {
    let Some(card) = cards.first().copied() else {
        return Ok(false);
    };
    match destination {
        Destination::Tableau { column } => {
            let pile = game
                .tableau
                .get(*column)
                .ok_or_else(|| "tableau destination is out of range".to_owned())?;
            if matches!(source, Source::Tableau { column: source_column, .. } if source_column == column)
            {
                return Ok(false);
            }
            Ok(pile
                .visible
                .last()
                .map_or(rank(card) == 13, |top| can_stack(card, *top)))
        }
        Destination::Foundation {
            suit: foundation_suit,
        } => {
            if *foundation_suit >= SUITS {
                return Err("foundation destination is out of range".to_owned());
            }
            if cards.len() != 1 || matches!(source, Source::Foundation { .. }) {
                return Ok(false);
            }
            let foundation = &game.foundations[*foundation_suit];
            Ok(suit(card) == *foundation_suit && usize::from(rank(card)) == foundation.len() + 1)
        }
    }
}

pub fn move_cards(
    mut game: Game,
    source: Source,
    destination: Destination,
) -> Result<MoveResult, String> {
    validate(&game)?;
    let cards = source_cards(&game, &source)?;
    if !legal_destination(&game, &cards, &source, &destination)? {
        return Ok(unchanged(game));
    }

    match source {
        Source::Waste => {
            game.waste.pop();
        }
        Source::Tableau { column, card } => {
            game.tableau[column].visible.truncate(card);
        }
        Source::Foundation { suit } => {
            game.foundations[suit].pop();
        }
    }

    match destination {
        Destination::Tableau { column } => game.tableau[column].visible.extend(cards),
        Destination::Foundation { suit } => game.foundations[suit].push(cards[0]),
    }

    let mut flipped = false;
    if let Source::Tableau { column, .. } = source {
        let pile = &mut game.tableau[column];
        if pile.visible.is_empty()
            && let Some(card) = pile.hidden.pop()
        {
            pile.visible.push(card);
            flipped = true;
        }
    }
    game.won = game
        .foundations
        .iter()
        .all(|foundation| foundation.len() == 13);
    validate(&game)?;
    Ok(MoveResult {
        game,
        moved: true,
        flipped,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deal_is_deterministic_and_classic() {
        let game = new_game(42, 1).unwrap();
        assert_eq!(game, new_game(42, 1).unwrap());
        assert_ne!(game, new_game(43, 1).unwrap());
        assert_eq!(game.stock.len(), 24);
        for (column, pile) in game.tableau.iter().enumerate() {
            assert_eq!(pile.hidden.len(), column);
            assert_eq!(pile.visible.len(), 1);
        }
        validate(&game).unwrap();
    }

    #[test]
    fn draw_three_recycles_in_the_original_order() {
        let mut game = new_game(7, 3).unwrap();
        let first = *game.stock.last().unwrap();
        while !game.stock.is_empty() {
            game = draw(game).unwrap().game;
        }
        assert_eq!(game.waste.len(), 24);
        game = draw(game).unwrap().game;
        assert!(game.waste.is_empty());
        assert_eq!(game.stock.last(), Some(&first));
    }

    #[test]
    fn moving_from_tableau_flips_the_next_card() {
        let mut game = new_game(9, 1).unwrap();
        let card = game.tableau[1].visible[0];
        game.tableau[0].visible[0] = if is_red(card) {
            (3 * 13) as u8 + rank(card)
        } else {
            13 + rank(card)
        };
        // Restore uniqueness after replacing the destination card.
        let replacement = game.tableau[0].visible[0];
        let location = game
            .stock
            .iter()
            .position(|candidate| *candidate == replacement)
            .unwrap();
        game.stock[location] = new_game(9, 1).unwrap().tableau[0].visible[0];
        validate(&game).unwrap();
        let moved = move_cards(
            game,
            Source::Tableau { column: 1, card: 0 },
            Destination::Tableau { column: 0 },
        )
        .unwrap();
        assert!(moved.moved);
        assert!(moved.flipped);
        assert_eq!(moved.game.tableau[1].hidden.len(), 0);
        assert_eq!(moved.game.tableau[1].visible.len(), 1);
    }

    #[test]
    fn only_kings_enter_empty_columns() {
        let game = new_game(12, 1).unwrap();
        let card = game.tableau[0].visible[0];
        let mut empty = game.clone();
        empty.tableau[6].hidden.clear();
        empty.tableau[6].visible.clear();
        // This intentionally creates a partial test position, so test the rule helper directly.
        let source = Source::Tableau { column: 0, card: 0 };
        let cards = vec![card];
        assert_eq!(
            legal_destination(&empty, &cards, &source, &Destination::Tableau { column: 6 })
                .unwrap(),
            rank(card) == 13
        );
    }

    #[test]
    fn final_king_completes_the_game() {
        let foundations = (0..SUITS)
            .map(|foundation_suit| {
                let cards = if foundation_suit == 3 { 12 } else { 13 };
                (0..cards)
                    .map(|rank| (foundation_suit * 13 + rank) as u8)
                    .collect()
            })
            .collect();
        let mut tableau = (0..TABLEAU_COLUMNS)
            .map(|_| TableauPile {
                hidden: Vec::new(),
                visible: Vec::new(),
            })
            .collect::<Vec<_>>();
        tableau[0].visible.push(51);
        let game = Game {
            draw_count: 1,
            stock: Vec::new(),
            waste: Vec::new(),
            foundations,
            tableau,
            won: false,
        };
        validate(&game).unwrap();
        let result = move_cards(
            game,
            Source::Tableau { column: 0, card: 0 },
            Destination::Foundation { suit: 3 },
        )
        .unwrap();
        assert!(result.moved);
        assert!(result.game.won);
        validate(&result.game).unwrap();
    }
}
