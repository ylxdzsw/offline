(function (root) {
    'use strict'

    const messages = {
        en: {
            siteName: 'Offline Classic Games',
            gallery: 'Game Gallery',
            menu: 'Menu',
            close: 'Close',
            openGuide: 'How to play',
            howToPlay: 'How to play',
            rules: 'Rules',
            quickStart: 'Quick start',
            completeRules: 'Complete rules',
            basicTips: 'Basic tips',
            gotIt: 'Got it',
            language: 'Language',
            english: 'English',
            chinese: '中文',
            appearance: 'Appearance',
            themeSystem: 'System',
            themeLight: 'Light',
            themeDark: 'Dark',
            xiangqi: 'Xiangqi',
            wuziqi: 'Wuziqi',
            sudoku: 'Sudoku',
            '2048': '2048',
            junqi: 'Junqi',
            chess: 'Chess',
            reversi: 'Reversi',
            xiangqiDesc: 'Classic Chinese chess against an on-device opponent.',
            wuziqiDesc: 'Freestyle five-in-a-row on a 15×15 board.',
            sudokuDesc: 'A fresh, uniquely solvable number puzzle at your chosen level.',
            '2048Desc': 'Slide and merge matching tiles in the endlessly replayable number puzzle.',
            junqiDesc: 'Hidden-rank Luzhanqi with camps, railways, and an on-device opponent.',
            chessDesc: 'Full orthodox chess, including castling, en passant, and promotion.',
            reversiDesc: 'Surround, flip, and outscore a mobility-aware on-device opponent.',
            play: 'Play',
            continue: 'Continue',
            newGame: 'New game',
            undo: 'Undo',
            difficulty: 'Difficulty',
            easy: 'Easy',
            medium: 'Medium',
            hard: 'Hard',
            yourTurn: 'Your turn',
            aiThinking: 'Opponent is thinking…',
            youWin: 'You win',
            aiWins: 'Opponent wins',
            draw: 'Draw',
            check: 'Check — your turn',
            aiInCheck: 'Opponent is in check',
            confirmNew: 'Start a new game and discard this position?',
            storageWarning: 'Progress cannot be saved on this device.',
            source: 'Source code available under the MIT license',
            copyright: '© 2026 ylxdzsw',
            red: 'Red',
            black: 'Black',
            empty: 'empty',
            row: 'row',
            column: 'column',
            selected: 'selected',
            legalMove: 'legal move',
            lastMove: 'last move',
            xiangqiPieceKRed: 'red general',
            xiangqiPieceARed: 'red advisor',
            xiangqiPieceERed: 'red elephant',
            xiangqiPieceHRed: 'red horse',
            xiangqiPieceRRed: 'red chariot',
            xiangqiPieceCRed: 'red cannon',
            xiangqiPiecePRed: 'red soldier',
            xiangqiPieceKBlack: 'black general',
            xiangqiPieceABlack: 'black advisor',
            xiangqiPieceEBlack: 'black elephant',
            xiangqiPieceHBlack: 'black horse',
            xiangqiPieceRBlack: 'black chariot',
            xiangqiPieceCBlack: 'black cannon',
            xiangqiPiecePBlack: 'black soldier',
            blackStone: 'black stone',
            whiteStone: 'white stone',
            offlineReady: 'Ready for offline play',
            erase: 'Erase',
            notes: 'Notes',
            hint: 'Hint',
            sudokuPrompt: 'Fill every row, column, and 3×3 box',
            sudokuSolved: 'Puzzle solved — well done!',
            junqiYourSide: 'Your army',
            junqiEnemySide: 'Opponent',
            hiddenPiece: 'hidden enemy piece',
            junqiArrange: 'Arrange your army, then start the battle',
            junqiChooseSwap: 'Select another piece to swap',
            junqiInvalidSwap: 'That swap breaks the placement rules',
            junqiPlacementRules: 'Flag: headquarters · Mines: back two rows · Bombs: off front row',
            junqiShuffle: 'Shuffle',
            junqiStartBattle: 'Start battle',
            junqiBattleAttacker: 'The attacking piece won — your turn',
            junqiBattleDefender: 'The defending piece held — your turn',
            junqiBattleBoth: 'Both pieces were removed — your turn',
            junqiPieceF: 'Flag',
            junqiPieceM: 'Mine',
            junqiPieceB: 'Bomb',
            junqiPiece9: 'Cmdr',
            junqiPiece8: 'Army',
            junqiPiece7: 'Div',
            junqiPiece6: 'Brig',
            junqiPiece5: 'Regt',
            junqiPiece4: 'Bn',
            junqiPiece3: 'Co',
            junqiPiece2: 'Plt',
            junqiPiece1: 'Eng',
            choosePromotion: 'Choose a promotion',
            chessPieceKWhite: 'white king',
            chessPieceQWhite: 'white queen',
            chessPieceRWhite: 'white rook',
            chessPieceBWhite: 'white bishop',
            chessPieceNWhite: 'white knight',
            chessPiecePWhite: 'white pawn',
            chessPieceKBlack: 'black king',
            chessPieceQBlack: 'black queen',
            chessPieceRBlack: 'black rook',
            chessPieceBBlack: 'black bishop',
            chessPieceNBlack: 'black knight',
            chessPiecePBlack: 'black pawn',
            you: 'You',
            opponent: 'Opponent',
            opponentPasses: 'Opponent has no legal move — play again',
            youPass: 'No legal move for you — opponent plays again…',
            game2048Score: 'Score',
            game2048Best: 'Best',
            game2048Prompt: 'Swipe, use arrow keys, or tap a direction',
            game2048Reached: '2048 reached — keep going!',
            game2048Over: 'No moves left — game over',
            game2048NoMove: 'That direction cannot move any tiles',
            game2048Board: '2048 board',
            game2048Up: 'Move up',
            game2048Down: 'Move down',
            game2048Left: 'Move left',
            game2048Right: 'Move right',
        },
        zh: {
            siteName: '离线经典游戏',
            gallery: '经典游戏',
            menu: '菜单',
            close: '关闭',
            openGuide: '玩法介绍',
            howToPlay: '怎么玩',
            rules: '基本规则',
            quickStart: '三步上手',
            completeRules: '完整规则',
            basicTips: '入门技巧',
            gotIt: '知道了',
            language: '语言',
            english: 'English',
            chinese: '中文',
            appearance: '外观',
            themeSystem: '跟随系统',
            themeLight: '浅色',
            themeDark: '深色',
            xiangqi: '中国象棋',
            wuziqi: '五子棋',
            sudoku: '数独',
            '2048': '2048',
            junqi: '陆战棋',
            chess: '国际象棋',
            reversi: '黑白棋',
            xiangqiDesc: '与本地电脑对弈的经典中国象棋。',
            wuziqiDesc: '十五路棋盘上的无禁手五子棋。',
            sudokuDesc: '按所选难度生成全新且唯一解的数字谜题。',
            '2048Desc': '滑动并合并相同数字，在这款耐玩的数字游戏中挑战更高分。',
            junqiDesc: '包含行营、铁路和暗棋规则，与本地电脑对战。',
            chessDesc: '完整国际象棋规则，包含王车易位、吃过路兵和升变。',
            reversiDesc: '包围并翻转棋子，与重视行动力的本地电脑对弈。',
            play: '开始',
            continue: '继续',
            newGame: '新局',
            undo: '悔棋',
            difficulty: '难度',
            easy: '简单',
            medium: '中等',
            hard: '困难',
            yourTurn: '请走棋',
            aiThinking: '对手思考中…',
            youWin: '你赢了',
            aiWins: '对手获胜',
            draw: '和棋',
            check: '将军——请应将',
            aiInCheck: '已将军',
            confirmNew: '开始新局并放弃当前棋局？',
            storageWarning: '此设备无法保存进度。',
            source: '源代码以 MIT 许可证发布',
            copyright: '© 2026 ylxdzsw',
            red: '红方',
            black: '黑方',
            empty: '空位',
            row: '行',
            column: '列',
            selected: '已选中',
            legalMove: '可落子',
            lastMove: '上一步',
            xiangqiPieceKRed: '红帅',
            xiangqiPieceARed: '红仕',
            xiangqiPieceERed: '红相',
            xiangqiPieceHRed: '红马',
            xiangqiPieceRRed: '红车',
            xiangqiPieceCRed: '红炮',
            xiangqiPiecePRed: '红兵',
            xiangqiPieceKBlack: '黑将',
            xiangqiPieceABlack: '黑士',
            xiangqiPieceEBlack: '黑象',
            xiangqiPieceHBlack: '黑马',
            xiangqiPieceRBlack: '黑车',
            xiangqiPieceCBlack: '黑砲',
            xiangqiPiecePBlack: '黑卒',
            blackStone: '黑子',
            whiteStone: '白子',
            offlineReady: '已可离线使用',
            erase: '清除',
            notes: '笔记',
            hint: '提示',
            sudokuPrompt: '填满每行、每列和每个九宫格',
            sudokuSolved: '完成谜题——太棒了！',
            junqiYourSide: '我方',
            junqiEnemySide: '对方',
            hiddenPiece: '未揭晓的敌方棋子',
            junqiArrange: '布置我方棋子，然后开始对局',
            junqiChooseSwap: '再选择一枚棋子交换位置',
            junqiInvalidSwap: '此次交换不符合布阵规则',
            junqiPlacementRules: '军旗在大本营 · 地雷在后两排 · 炸弹不在前排',
            junqiShuffle: '随机布阵',
            junqiStartBattle: '开始对局',
            junqiBattleAttacker: '进攻方胜——请走棋',
            junqiBattleDefender: '防守方胜——请走棋',
            junqiBattleBoth: '双方同归于尽——请走棋',
            junqiPieceF: '军旗',
            junqiPieceM: '地雷',
            junqiPieceB: '炸弹',
            junqiPiece9: '司令',
            junqiPiece8: '军长',
            junqiPiece7: '师长',
            junqiPiece6: '旅长',
            junqiPiece5: '团长',
            junqiPiece4: '营长',
            junqiPiece3: '连长',
            junqiPiece2: '排长',
            junqiPiece1: '工兵',
            choosePromotion: '选择升变棋子',
            chessPieceKWhite: '白王',
            chessPieceQWhite: '白后',
            chessPieceRWhite: '白车',
            chessPieceBWhite: '白象',
            chessPieceNWhite: '白马',
            chessPiecePWhite: '白兵',
            chessPieceKBlack: '黑王',
            chessPieceQBlack: '黑后',
            chessPieceRBlack: '黑车',
            chessPieceBBlack: '黑象',
            chessPieceNBlack: '黑马',
            chessPiecePBlack: '黑兵',
            you: '你',
            opponent: '对手',
            opponentPasses: '对手无棋可下——请继续落子',
            youPass: '你无棋可下——对手继续落子…',
            game2048Score: '得分',
            game2048Best: '最高',
            game2048Prompt: '滑动棋盘、使用方向键或点击方向按钮',
            game2048Reached: '合成 2048——继续挑战吧！',
            game2048Over: '无路可走——本局结束',
            game2048NoMove: '这个方向无法移动',
            game2048Board: '2048 棋盘',
            game2048Up: '向上移动',
            game2048Down: '向下移动',
            game2048Left: '向左移动',
            game2048Right: '向右移动',
        },
    }

    const guides = {
        en: {
            xiangqi: {
                intro: 'You play Red and move first against the on-device opponent.',
                rules: [
                    'Tap a red piece, then a highlighted destination. Checkmate the opposing general, or leave it with no legal move, to win.',
                    'The general and advisors stay in the palace. Elephants stay on their side of the river; soldiers can also move sideways after crossing it.',
                    'Chariots move along clear lines. A horse can be blocked at its first step, while a cannon needs exactly one piece between it and a capture.',
                ],
                tips: [
                    'Bring out horses and chariots early, and keep your general well guarded.',
                    'Green marks show legal moves; blue marks show the previous move.',
                    'Undo takes back your move and the opponent\'s reply.',
                ],
            },
            wuziqi: {
                intro: 'You place Black stones and move first on a 15×15 board.',
                rules: [
                    'Tap any empty intersection to place one stone; the opponent then places a white stone.',
                    'The first player to connect five or more stones horizontally, vertically, or diagonally wins.',
                    'This is freestyle Wuziqi: overlines count as a win and there are no forbidden moves.',
                ],
                tips: [
                    'Block a line of four immediately; an open-ended line of three also deserves attention.',
                    'Try to make two threats at once so one move cannot stop both.',
                    'The red ring marks the most recent stone. Undo takes back a full turn.',
                ],
            },
            sudoku: {
                intro: 'Complete the grid using the digits 1 through 9.',
                rules: [
                    'Each row, column, and outlined 3×3 box must contain every digit once, with no repeats.',
                    'Printed numbers are fixed. Tap an empty cell, then choose a number below the board.',
                    'The puzzle is complete when every cell is filled correctly.',
                ],
                tips: [
                    'Start with rows, columns, or boxes that have only a few missing numbers.',
                    'Use Notes to keep possible digits; placing a number clears that note from its peers.',
                    'Red entries conflict with the solution. Hint fills one useful cell if you get stuck.',
                ],
            },
            '2048': {
                intro: 'Slide the numbered tiles and build a 2048 tile.',
                rules: [
                    'Each move slides every tile as far as it can go in one direction. A new 2 or 4 appears after every successful move.',
                    'When two tiles with the same value meet, they merge into one tile worth their sum. A tile can merge only once per move.',
                    'Reach 2048 to meet the goal, then keep playing for a higher score. The game ends only when no move remains.',
                ],
                tips: [
                    'Keep your largest tile in a corner and build nearby tiles toward it.',
                    'Avoid switching away from your chosen corner unless the board forces you to.',
                    'Undo restores the previous board and score; your best score is never reduced.',
                ],
            },
            junqi: {
                intro: 'You command the red army; enemy ranks stay hidden until they fight.',
                rules: [
                    'Before play, tap two red pieces to swap them, then start the battle. The Flag stays in headquarters, Mines in the back two rows, and Bombs off the front row.',
                    'Most pieces move one road step. On railways they can travel straight until blocked; engineers may also turn along connected rails.',
                    'Capture the enemy flag, or leave the enemy with no legal move, to win. Higher rank wins a battle; equal ranks and bombs remove both pieces, and only an engineer defeats a mine.',
                ],
                tips: [
                    'Keep engineers available for mines and their flexible railway movement.',
                    'Use bombs against likely high-ranking pieces, and keep railway routes open.',
                    'When a commander is lost, that side\'s flag is revealed.',
                ],
            },
            chess: {
                intro: 'You play White and move first against the on-device opponent.',
                rules: [
                    'Tap a white piece, then a highlighted square. Win by checkmating the black king; you must answer any check on your own king.',
                    'Rooks move straight, bishops diagonally, queens both ways, knights in an L, and kings one square. Pawns move forward but capture diagonally.',
                    'Castling, en passant, pawn promotion, stalemate, repetition, and the fifty-move rule are supported.',
                ],
                tips: [
                    'Develop knights and bishops, fight for the center, and castle early when it is safe.',
                    'Before moving, check whether the destination leaves a piece undefended.',
                    'Dots mark quiet moves and rings mark captures. Undo takes back a full turn.',
                ],
            },
            reversi: {
                intro: 'You play Black and move first against the on-device opponent.',
                rules: [
                    'Place a black disc on a highlighted square so it brackets one or more white discs in a straight line; every bracketed disc flips to black.',
                    'A move may flip discs in several directions. If a player has no legal move, that turn passes automatically.',
                    'The game ends when neither player can move. The player with more discs on the board wins.',
                ],
                tips: [
                    'Corners can never be flipped. Secure them, and be cautious with squares directly beside an empty corner.',
                    'Having fewer discs early can be useful if it leaves the opponent fewer legal moves.',
                    'Pale dots show legal moves; the red marker shows the latest disc. Undo takes back a full turn.',
                ],
            },
        },
        zh: {
            xiangqi: {
                intro: '你执红先行，与本地电脑对弈。',
                rules: [
                    '点选红方棋子，再点可走的位置。将死对方将帅，或使对方无子可走即获胜。',
                    '将帅和士只能在九宫内活动，象不能过河，兵卒过河后可左右移动。',
                    '车走直线；马腿被挡时不能走；炮吃子时中间必须恰好隔一枚棋子。',
                ],
                tips: [
                    '尽早出马、出车，同时保护好将帅。',
                    '绿色标记表示可走位置，蓝色标记表示上一步。',
                    '“悔棋”会撤销你和对手的一个完整回合。',
                ],
            },
            wuziqi: {
                intro: '你执黑先行，在 15×15 棋盘上对弈。',
                rules: [
                    '点击任意空交叉点落下一枚黑子，之后对手落一枚白子。',
                    '横、竖或斜线上率先连成五枚或更多同色棋子即获胜。',
                    '本游戏采用无禁手规则：长连也算胜利，没有禁手。',
                ],
                tips: [
                    '对手形成四连时要立即阻挡；两端均空的三连也需要特别留意。',
                    '尝试一步同时制造两个威胁，让对手无法全部防住。',
                    '红圈标出最新落子；“悔棋”会撤销一个完整回合。',
                ],
            },
            sudoku: {
                intro: '用 1 至 9 的数字填完棋盘。',
                rules: [
                    '每一行、每一列和每个粗线 3×3 宫内都要恰好包含 1 至 9，不能重复。',
                    '题目给出的数字不能修改。点选空格，再从棋盘下方选择数字。',
                    '所有格子都正确填满后，谜题即完成。',
                ],
                tips: [
                    '从只缺少数数字的行、列或宫开始排查。',
                    '用“笔记”记录候选数；正式填入数字后，相关格的同数笔记会自动清除。',
                    '红色数字表示有错误。卡住时，“提示”可帮你填入一格。',
                ],
            },
            '2048': {
                intro: '滑动数字方块，尝试合成一枚 2048。',
                rules: [
                    '每一步会让所有方块沿一个方向滑到尽头；只要棋盘发生移动，就会新出现一个 2 或 4。',
                    '两个相同数字相遇时会合并为它们的和；同一枚方块每步只能合并一次。',
                    '合成 2048 即达成目标，之后仍可继续挑战高分；只有完全无路可走时游戏才结束。',
                ],
                tips: [
                    '把最大数字固定在一个角落，并让附近的数字逐步向它靠拢。',
                    '除非棋盘形势迫使你改变，否则尽量不要离开选定的角落。',
                    '“悔棋”会恢复上一步的棋盘和得分，但不会降低最高分。',
                ],
            },
            junqi: {
                intro: '你指挥红方部队；敌方棋子的等级在交战前保密。',
                rules: [
                    '开局前，依次点选两枚红方棋子可交换位置，布阵完成后开始对局。军旗须在大本营，地雷须在后两排，炸弹不能在前排。',
                    '大多数棋子每次沿公路走一步；在铁路上可沿直线走到被阻挡为止，工兵还可沿相连铁路转弯。',
                    '夺取敌方军旗，或使敌方无子可走即获胜。战斗时等级高者胜；同级或炸弹交战时同归于尽，只有工兵能排除地雷。',
                ],
                tips: [
                    '留住工兵用来排雷，并利用它们灵活的铁路移动。',
                    '用炸弹对付可能的高级棋子，同时尽量保持铁路畅通。',
                    '一方的司令被消灭后，该方军旗位置会显示出来。',
                ],
            },
            chess: {
                intro: '你执白先行，与本地电脑对弈。',
                rules: [
                    '点选白方棋子，再点高亮格子。将死黑王即获胜；自己的王被将军时必须立即应将。',
                    '车走直线，象走斜线，后兼有两者走法，马走 L 形，王每次一格。兵向前走、斜向吃子。',
                    '游戏支持王车易位、吃过路兵、兵升变，以及逼和、三次重复和五十回合规则。',
                ],
                tips: [
                    '尽早出马和象、争夺中心，并在安全时尽早王车易位。',
                    '落子前先看一眼：目标格上的棋子会不会失去保护？',
                    '小圆点表示普通走法，圆环表示吃子。“悔棋”会撤销一个完整回合。',
                ],
            },
            reversi: {
                intro: '你执黑先行，与本地电脑对弈。',
                rules: [
                    '在亮点处落下一枚黑子，使一条直线上的一个或多个白子被两端的黑子夹住；所有被夹住的棋子都会翻成黑色。',
                    '一次落子可以同时翻转多个方向。某一方没有合法落点时会自动跳过该回合。',
                    '双方都无棋可下时游戏结束，棋盘上棋子更多的一方获胜。',
                ],
                tips: [
                    '角上的棋子永远不会被翻转；尽量占角，并谨慎落在空角旁边。',
                    '前期棋子少不一定落后；限制对手的合法落点往往更加重要。',
                    '浅色圆点表示合法落点，红点标出最新落子；“悔棋”会撤销一个完整回合。',
                ],
            },
        },
    }

    const guideDetails = {
        en: {
            xiangqi: {
                visual: 'Three movement details: a blocked horse leg cancels moves on that side; a cannon captures over exactly one screen; and a soldier gains sideways moves only after crossing the river.',
                sections: [
                    {
                        title: 'Turn, capture, and the goal',
                        items: [
                            'Red moves first, then the sides alternate one move at a time. There is no passing.',
                            'Move onto an enemy piece to capture it. You may never make a move that leaves your own general under attack.',
                            'Win by capturing or checkmating the enemy general, or by leaving the opponent with no legal move. A third occurrence of the same position is a draw in this game.',
                        ],
                    },
                    {
                        title: 'Palace and river pieces',
                        items: [
                            'General (帅/将): one point horizontally or vertically, always inside its 3×3 palace. The two generals may not face each other on an open file; either may capture the other along such an open file.',
                            'Advisor (仕/士): one point diagonally, always inside its own palace.',
                            'Elephant (相/象): exactly two points diagonally. It cannot cross the river and cannot jump over a piece on the intervening “elephant eye.”',
                            'Soldier (兵/卒): one point straight forward. After crossing the river it may instead move one point sideways, but it can never move backward.',
                        ],
                    },
                    {
                        title: 'Long-range pieces',
                        items: [
                            'Chariot (车): any number of open points horizontally or vertically; it cannot jump.',
                            'Horse (马): one point straight, then one point diagonally outward. A piece on the first straight point blocks both moves on that side—the “horse leg.”',
                            'Cannon (炮/砲): moves like a chariot when not capturing. To capture, it must jump over exactly one intervening piece of either color, called the screen, and land on the enemy piece beyond it.',
                        ],
                    },
                    {
                        title: 'Playing this version',
                        items: [
                            'Tap one of your red pieces, then a green legal destination. Selecting another red piece changes your choice; blue outlines mark the preceding move.',
                            'Easy, Medium, and Hard change the on-device opponent. Progress is saved on this device and works without a connection.',
                            'Undo normally removes both your move and the opponent’s reply. If the opponent is still thinking, it removes only your unanswered move.',
                        ],
                    },
                ],
            },
            wuziqi: {
                visual: 'Winning lines may be horizontal, vertical, or diagonal. The six-stone line at the lower left also wins in this freestyle version.',
                sections: [
                    {
                        title: 'Board and turns',
                        items: [
                            'The board has 15×15 intersections. You place one black stone on any empty intersection, then the opponent places one white stone.',
                            'Black moves first. Stones never move or get captured after they are placed, and a turn cannot be passed.',
                        ],
                    },
                    {
                        title: 'Winning and drawing',
                        items: [
                            'The first move that makes an unbroken line of at least five stones of one color wins immediately. Only horizontal, vertical, and the two diagonal directions count.',
                            'This is freestyle Wuziqi: six or more in a row also wins. There are no forbidden opening, double-three, double-four, or overline moves.',
                            'If all 225 intersections fill without a winning line, the game is a draw.',
                        ],
                    },
                    {
                        title: 'Playing this version',
                        items: [
                            'Tap an empty intersection to place your black stone. The red ring marks the most recent move.',
                            'Easy, Medium, and Hard change the on-device opponent. Progress is saved automatically for offline play.',
                            'Undo normally removes your move and the opponent’s reply; while the opponent is thinking, it removes only your latest move.',
                        ],
                    },
                ],
            },
            sudoku: {
                visual: 'The green cell’s whole row and column, plus its tan 3×3 box, are peers. A second 5 in any highlighted area would conflict.',
                sections: [
                    {
                        title: 'The puzzle',
                        items: [
                            'Sudoku is a one-player logic puzzle on a 9×9 grid divided into nine outlined 3×3 boxes. It involves no arithmetic.',
                            'Every generated puzzle has one solution. The darker printed clues are fixed and cannot be changed.',
                        ],
                    },
                    {
                        title: 'The one rule',
                        items: [
                            'Fill every empty cell with a digit from 1 through 9 so each row contains each digit exactly once.',
                            'The same must be true for every column and every outlined 3×3 box. Therefore a digit cannot repeat among any cell’s row, column, or box peers.',
                            'The puzzle is solved only when all 81 cells match the valid completed grid.',
                        ],
                    },
                    {
                        title: 'Entries, notes, and help',
                        items: [
                            'Tap an editable cell, then a digit. Erase clears it. Red entries do not match the solution and should be reconsidered.',
                            'Turn on Notes to toggle small candidate digits instead of making a final entry. A final digit automatically removes that candidate from related notes.',
                            'Hint fills one useful cell correctly. Undo restores the latest entry, note change, or hint.',
                            'On a keyboard, use 1–9 to enter, Backspace/Delete to erase, and N to toggle Notes. Changing difficulty starts a fresh puzzle immediately.',
                        ],
                    },
                ],
            },
            '2048': {
                visual: 'Merge once per move: 2–2–2–2 becomes 4–4, while 4–4–4 becomes 8–4 and the remaining 4 stays separate.',
                sections: [
                    {
                        title: 'Start and movement',
                        items: [
                            'A new game starts with two tiles on a 4×4 board. Each tile is a power of two.',
                            'Choose Up, Down, Left, or Right. Every tile slides as far as possible in that direction; tiles cannot move through one another.',
                            'A move that changes the board adds one new tile in a random empty cell: usually a 2, and occasionally a 4. A direction that changes nothing adds no tile.',
                        ],
                    },
                    {
                        title: 'Merging and score',
                        items: [
                            'When two equal tiles collide, they merge into one tile with twice the value. The new value is added to your score.',
                            'Each tile may participate in only one merge per move. For example, 2–2–2–2 moving left becomes 4–4, not 8.',
                            'Creating 2048 reaches the goal but does not end the game; you may continue building larger tiles and a higher score.',
                        ],
                    },
                    {
                        title: 'End and controls',
                        items: [
                            'The game ends only when the board is full and no horizontally or vertically adjacent pair has the same value.',
                            'Swipe across the board, use the arrow or W/A/S/D keys while the board is focused, or tap the four direction buttons.',
                            'Undo restores the board and score before the last successful move, but the recorded Best score never decreases. New game also preserves Best.',
                        ],
                    },
                ],
            },
            junqi: {
                visual: 'Thick lines are railways, diamonds are safe camps, boxed spaces are headquarters, and the green route shows how an Engineer may turn along connected rails.',
                sections: [
                    {
                        title: 'Army and hidden information',
                        items: [
                            'Each side has 25 pieces: one Flag; three Mines; two Bombs; one Commander and Army Commander; two each of Division, Brigade, Regiment, and Battalion; and three each of Company, Platoon, and Engineer.',
                            'A new game opens in placement. Tap two red pieces to swap them, use Shuffle for another legal formation, then choose Start battle. The Flag must stay in a headquarters, Mines in the back two rows, and Bombs off the front row.',
                            'Your red ranks are visible; the computer receives a hidden legal deployment, and its ranks remain hidden until those pieces fight. Red moves first.',
                            'From highest to lowest, movable ranks are Commander, Army Commander, Division, Brigade, Regiment, Battalion, Company, Platoon, and Engineer.',
                        ],
                    },
                    {
                        title: 'Roads, camps, and railways',
                        items: [
                            'On ordinary roads, a movable piece follows one connected line to an adjacent position. The diagonal lines into and out of camps count as road connections.',
                            'An empty camp may be entered. A piece occupying a camp cannot be attacked, although it may move out on a later turn.',
                            'On a railway, most pieces may travel any unobstructed distance in one straight line, stopping before a friendly piece or capturing the first enemy piece.',
                            'Engineers may turn at railway junctions and follow any connected, unobstructed railway route. Only the three marked bridges cross the central divide.',
                            'Flags and Mines never move. Any piece that enters a headquarters also becomes unable to move.',
                        ],
                    },
                    {
                        title: 'Battle results',
                        items: [
                            'Except for special pieces, the higher rank survives and occupies the defender’s position; the lower rank is removed. Equal ranks remove each other.',
                            'An Engineer defeats a Mine. Every other movable rank that attacks a Mine is removed while the Mine remains.',
                            'A Bomb fighting any non-Flag piece removes both pieces, regardless of rank. Reaching the enemy Flag captures it.',
                            'After a battle, any surviving participant stays revealed. When a Commander is eliminated, that side’s Flag is revealed.',
                        ],
                    },
                    {
                        title: 'Winning and controls',
                        items: [
                            'Win by capturing the enemy Flag or by leaving the enemy with no legal move.',
                            'Tap a movable red piece, then a green destination; a red outline marks a possible battle. Difficulty changes the offline opponent.',
                            'Undo normally removes your move and the opponent’s reply; while the opponent is thinking, it removes only your unanswered move.',
                        ],
                    },
                ],
            },
            chess: {
                visual: 'From left: all eight knight destinations; king-side castling moves the king two squares and the rook beside it; en passant captures the pawn that just advanced two squares.',
                sections: [
                    {
                        title: 'Turn, capture, and check',
                        items: [
                            'White moves first, then players alternate one move. Move onto an enemy piece to capture it; you cannot capture your own piece or pass.',
                            'Your king may never be in check after your move. If it is attacked, you must move the king, capture the attacker, or block the attack when possible.',
                            'Checkmate wins: the king is attacked and no legal reply exists. Kings are never actually captured.',
                        ],
                    },
                    {
                        title: 'How the pieces move',
                        items: [
                            'King: one square in any direction, but never onto an attacked square.',
                            'Queen: any number of unobstructed squares horizontally, vertically, or diagonally.',
                            'Rook: any number of unobstructed squares horizontally or vertically. Bishop: any number diagonally.',
                            'Knight: two squares in one direction and one perpendicular. It is the only piece that can jump over pieces.',
                            'Pawn: one square straight forward into an empty square; from its starting rank it may move two if both squares are empty. It captures one square diagonally forward and never moves backward.',
                        ],
                    },
                    {
                        title: 'Special moves',
                        items: [
                            'Castling moves the king two squares toward a rook, then places that rook beside the king. It is allowed only if neither piece has moved, the spaces are clear, the king is not in check, and the king does not cross or land on an attacked square.',
                            'En passant: immediately after an enemy pawn advances two squares past the capture square of your pawn, your pawn may capture it as though it had advanced only one. The right expires after that one reply.',
                            'Promotion: a pawn reaching the farthest rank must become a queen, rook, bishop, or knight; this game asks you to choose.',
                        ],
                    },
                    {
                        title: 'Draws and this version',
                        items: [
                            'The game draws on stalemate (the side to move is not in check but has no legal move), a third occurrence of the same position, fifty moves by each side without a pawn move or capture, or insufficient mating material.',
                            'Tap a white piece, then a highlighted square. Dots mark non-captures, rings mark captures, and a red king square means check.',
                            'Difficulty controls the on-device opponent. Undo normally takes back a full pair of moves; progress saves automatically for offline play.',
                        ],
                    },
                ],
            },
            reversi: {
                visual: 'Place the outlined black disc to bracket the two white discs; both white discs then flip to black.',
                sections: [
                    {
                        title: 'Board and legal moves',
                        items: [
                            'The game begins with two black and two white discs in the center of an 8×8 board. You play Black and move first.',
                            'A legal move places a disc on an empty square so that, in at least one straight line, one or more adjacent enemy discs lie between the new disc and another disc of your color.',
                            'Lines may be horizontal, vertical, or diagonal. There can be no empty square in the bracketed line.',
                        ],
                    },
                    {
                        title: 'Flipping and passing',
                        items: [
                            'Every enemy disc bracketed by the new disc flips to your color. One placement may bracket and flip discs in several of the eight directions at once.',
                            'You must make a legal move when one exists. If you have none, your turn passes automatically; if the opponent still has a move, they play again.',
                        ],
                    },
                    {
                        title: 'Ending and controls',
                        items: [
                            'The game ends when neither side has a legal move, whether or not the board is full. More discs wins; equal counts draw.',
                            'Pale dots mark all legal black moves. The scoreboard counts current discs, and the red marker identifies the latest placement.',
                            'Difficulty changes the on-device opponent. Undo normally removes your move and the opponent’s reply, including automatic passes.',
                        ],
                    },
                ],
            },
        },
        zh: {
            xiangqi: {
                visual: '三个关键走法：马腿被堵会封住该方向；炮吃子必须恰好隔一个炮架；兵只有过河后才能横走。',
                sections: [
                    {
                        title: '回合、吃子与胜负',
                        items: [
                            '红方先行，双方轮流走一步，不能跳过回合。',
                            '走到敌方棋子所在点即可吃子。任何一步都不能让自己的将帅仍受攻击。',
                            '吃掉或将死对方将帅，或使对方无任何合法走法即获胜。本游戏中同一局面第三次出现时判和。',
                        ],
                    },
                    {
                        title: '九宫与过河棋子',
                        items: [
                            '帅/将：每次横走或竖走一点，不能离开己方九宫。双方将帅不能在同一路上无遮拦地照面；若已照面，也可沿直线直接吃掉对方。',
                            '仕/士：每次沿斜线走一点，不能离开己方九宫。',
                            '相/象：沿斜线恰好走两点，不能过河；中间的“象眼”有棋子时不能走。',
                            '兵/卒：每次向前走一点；过河后也可横走一点，但永远不能后退。',
                        ],
                    },
                    {
                        title: '长距离棋子',
                        items: [
                            '车：沿横线或竖线走任意距离，但不能越子。',
                            '马：先直走一点，再向外斜走一点；第一点若被占住，对应方向的两条“马腿”都被蹩住。',
                            '炮/砲：不吃子时与车相同；吃子时，炮与目标之间必须恰好隔一枚任意颜色的“炮架”，再跳吃目标。',
                        ],
                    },
                    {
                        title: '本游戏的操作',
                        items: [
                            '先点选红方棋子，再点绿色合法位置；改点另一枚红子即可换子。蓝色圈标出上一步。',
                            '简单、中等、困难会改变本地电脑对手的强度；进度保存在本机，无网络也可继续。',
                            '通常“悔棋”会撤销你的一步和电脑的回应；若电脑仍在思考，则只撤销你尚未得到回应的一步。',
                        ],
                    },
                ],
            },
            wuziqi: {
                visual: '胜线可以横向、纵向或斜向；左下方的六连在本游戏的无禁手规则中同样获胜。',
                sections: [
                    {
                        title: '棋盘与回合',
                        items: [
                            '棋盘有 15×15 个交叉点。你先在任一空交叉点放一枚黑子，随后对手放一枚白子。',
                            '黑方先行。棋子落下后不会移动或被吃掉，也不能跳过回合。',
                        ],
                    },
                    {
                        title: '胜负规则',
                        items: [
                            '某一步首次形成至少五枚同色棋子的连续直线时立即获胜；只计算横、竖和两个斜线方向。',
                            '本游戏采用无禁手的自由规则：六连或更长也算胜利；没有开局限制、三三、四四或长连禁手。',
                            '若 225 个交叉点全部填满而没有任何胜线，则判和。',
                        ],
                    },
                    {
                        title: '本游戏的操作',
                        items: [
                            '点击空交叉点即可落黑子；红圈标出最后一手。',
                            '简单、中等、困难会改变本地电脑对手的强度；对局会自动保存在本机。',
                            '通常“悔棋”会撤销你和电脑各一步；若电脑仍在思考，则只撤销你刚下的一步。',
                        ],
                    },
                ],
            },
            sudoku: {
                visual: '绿色中心格所在的整行、整列，以及棕色 3×3 宫都是相关格；任一高亮区域再出现 5 都会冲突。',
                sections: [
                    {
                        title: '谜题构成',
                        items: [
                            '数独是单人逻辑谜题：9×9 棋盘又分成九个粗线 3×3 宫，不需要做算术。',
                            '每道生成的题目都只有一个解。较深色的题目数字固定不变，不能修改。',
                        ],
                    },
                    {
                        title: '唯一规则',
                        items: [
                            '在所有空格填入 1 至 9，使每一行都恰好出现一次每个数字。',
                            '每一列、每个粗线 3×3 宫也必须满足同一要求；因此同一行、列或宫内不能重复数字。',
                            '只有 81 格全部符合有效完成盘面时才算解题成功。',
                        ],
                    },
                    {
                        title: '填数、笔记与帮助',
                        items: [
                            '点选可编辑格，再选择数字；“清除”会擦除该格。红色数字与答案不符，需要重新检查。',
                            '开启“笔记”后，数字会作为小候选数开关，而不是正式答案；正式填数后，相关格里的同数候选会自动清除。',
                            '“提示”会正确填入一个合适的格子；“悔棋”可撤销最近一次填数、笔记变化或提示。',
                            '使用键盘时，1–9 填数，Backspace/Delete 清除，N 切换笔记。更改难度会立即开始一道新题。',
                        ],
                    },
                ],
            },
            '2048': {
                visual: '每步只合并一次：2–2–2–2 变成 4–4；4–4–4 则变成 8–4，不会继续合并。',
                sections: [
                    {
                        title: '开局与移动',
                        items: [
                            '新局从 4×4 棋盘上的两枚数字方块开始；所有数字都是 2 的整数次幂。',
                            '每次选择上、下、左或右，所有方块都会沿该方向尽量滑到底，且不能穿过其他方块。',
                            '只要棋盘发生变化，就会在随机空格新增一枚方块：通常是 2，偶尔是 4。无效方向不会新增方块。',
                        ],
                    },
                    {
                        title: '合并与得分',
                        items: [
                            '两个相同数字相撞时会合成一枚两倍数值的方块，新数值同时加入本步得分。',
                            '每枚方块每步最多参与一次合并。例如 2–2–2–2 向左移动会变成 4–4，而不是 8。',
                            '合成 2048 即达成目标，但不会结束游戏；你可以继续合成更大数字、挑战更高分。',
                        ],
                    },
                    {
                        title: '结束与操作',
                        items: [
                            '只有棋盘填满，而且横向和纵向都没有相邻同数方块时，游戏才结束。',
                            '可以在棋盘上滑动、聚焦棋盘后使用方向键或 W/A/S/D，也可以点击四个方向按钮。',
                            '“悔棋”恢复最近一次有效移动前的棋盘和得分，但“最高”记录不会下降；开始新局也会保留最高分。',
                        ],
                    },
                ],
            },
            junqi: {
                visual: '粗线是铁路，菱形是安全的行营，方框是大本营；绿色路线演示工兵如何沿相连铁路转弯。',
                sections: [
                    {
                        title: '棋子与暗棋',
                        items: [
                            '双方各有 25 枚棋子：军旗 1、地雷 3、炸弹 2；司令和军长各 1；师长、旅长、团长、营长各 2；连长、排长、工兵各 3。',
                            '新局先进入布阵阶段：依次点选两枚红方棋子可交换位置，也可选择“随机布阵”，完成后点击“开始对局”。军旗须在大本营，地雷须在后两排，炸弹不能在前排。',
                            '你的红方等级始终可见；电脑会获得一套隐藏的合法布阵，敌方等级在交战前保密。红方先行。',
                            '可移动棋子的等级由高到低是：司令、军长、师长、旅长、团长、营长、连长、排长、工兵。',
                        ],
                    },
                    {
                        title: '公路、行营与铁路',
                        items: [
                            '在普通公路上，可移动棋子每次沿连接线走到相邻位置；进出行营的斜线也属于公路。',
                            '空行营可以进入；行营内已有棋子时不能被攻击，但该棋子下一回合仍可走出。',
                            '在铁路上，大多数棋子可沿无阻挡的直线走任意距离；遇到己方棋子前停下，或吃掉遇到的第一枚敌子。',
                            '工兵可以在铁路连接处转弯，沿任意连通且无阻挡的铁路行进。中央分界线只有三个标出的通道可跨越。',
                            '军旗和地雷永远不能移动；任何棋子一旦进入大本营，也不能再移动。',
                        ],
                    },
                    {
                        title: '交战结果',
                        items: [
                            '除特殊棋子外，高等级留下并占据防守方位置，低等级被移除；同等级交战则双方同时移除。',
                            '工兵可以排除地雷；其他可移动等级攻击地雷时，进攻方被移除，地雷保留。',
                            '炸弹与任何非军旗棋子交战，不论等级都同归于尽；走到敌方军旗位置则直接夺旗。',
                            '交战后存活的棋子会保持明牌；某方司令被消灭时，该方军旗位置会公开。',
                        ],
                    },
                    {
                        title: '胜负与操作',
                        items: [
                            '夺取敌方军旗，或使敌方没有任何合法走法，即可获胜。',
                            '先点可移动的红子，再点绿色位置；红色外框表示可能发生交战。难度会改变本地电脑强度。',
                            '通常“悔棋”会撤销你和电脑各一步；若电脑仍在思考，则只撤销你尚未得到回应的一步。',
                        ],
                    },
                ],
            },
            chess: {
                visual: '从左到右：马的八个落点；短易位时王走两格、车移到王旁；吃过路兵会吃掉刚走两格的敌兵。',
                sections: [
                    {
                        title: '回合、吃子与将军',
                        items: [
                            '白方先行，双方轮流走一步。走到敌方棋子所在格即可吃子；不能吃己方棋子，也不能跳过回合。',
                            '走完后自己的王绝不能仍被将军。王受攻击时，必须移动王、吃掉进攻棋子，或在可能时挡住攻击路线。',
                            '将死即获胜：王正受攻击，且没有任何合法应对。对局中不会真的把王吃掉。',
                        ],
                    },
                    {
                        title: '各棋子的走法',
                        items: [
                            '王：向任意方向走一格，但不能进入受攻击的格子。',
                            '后：沿横、竖或斜线走任意无阻挡距离。',
                            '车：沿横线或竖线走任意无阻挡距离；象：沿斜线走任意无阻挡距离。',
                            '马：沿一个方向走两格，再垂直转一格；它是唯一可以越过其他棋子的棋子。',
                            '兵：向前走一格到空格；在起始行可在前方两格都为空时走两格。兵向前斜吃一格，不能后退。',
                        ],
                    },
                    {
                        title: '特殊走法',
                        items: [
                            '王车易位：王向车的方向走两格，车再移到王旁。条件是王和该车都未移动、之间无棋子、王当前未被将军，而且王经过和落下的格子都不受攻击。',
                            '吃过路兵：敌兵刚从起始位前进两格并越过己兵可斜吃的格子时，己兵可立即把它当作只走一格来吃；若没有立刻使用，权利消失。',
                            '兵升变：兵到达最远一行时，必须升为后、车、象或马；本游戏会让你选择。',
                        ],
                    },
                    {
                        title: '和棋与本游戏操作',
                        items: [
                            '逼和（未被将军但无合法走法）、同一局面第三次出现、双方各走五十回合都没有兵移动或吃子，以及子力不足以将死时，均判和。',
                            '先点白方棋子，再点高亮格；圆点表示普通走法，圆环表示吃子，王所在格变红表示被将军。',
                            '难度控制本地电脑强度；通常“悔棋”撤销双方各一步；进度会自动保存在本机，可离线继续。',
                        ],
                    },
                ],
            },
            reversi: {
                visual: '把带外圈的黑子落下，夹住中间两枚白子，它们就会全部翻成黑色。',
                sections: [
                    {
                        title: '棋盘与合法落子',
                        items: [
                            '8×8 棋盘中央起始有两枚黑子和两枚白子。你执黑先行。',
                            '合法落子必须放在空格，并在至少一条直线上，让一枚或多枚相邻敌子夹在新子与另一枚己方棋子之间。',
                            '夹线可以横向、纵向或斜向；被夹的连续棋子之间不能有空格。',
                        ],
                    },
                    {
                        title: '翻子与跳过',
                        items: [
                            '新子夹住的所有敌子都翻成己方颜色；同一步可以在八个方向中的多个方向同时夹住并翻子。',
                            '有合法落点时必须落子；若完全无处可下，会自动跳过该回合。只要对手仍有合法落点，对手就连续再下一手。',
                        ],
                    },
                    {
                        title: '结束与操作',
                        items: [
                            '双方都没有合法落点时游戏结束，不要求棋盘填满。棋子较多者获胜，数量相同则和棋。',
                            '浅色圆点标出全部合法黑方落点；计分栏显示当前棋子数，红点标出最后落子。',
                            '难度会改变本地电脑强度；通常“悔棋”会撤销你和电脑各一步，并正确处理自动跳过的回合。',
                        ],
                    },
                ],
            },
        },
    }

    const params = new URLSearchParams(root.location ? root.location.search : '')
    const explicit = params.get('lang')
    const browserLanguages = root.navigator?.languages || [root.navigator?.language || 'en']
    const locale = explicit === 'zh' || explicit === 'en'
        ? explicit
        : browserLanguages.some(language => String(language).toLowerCase().startsWith('zh')) ? 'zh' : 'en'

    const t = key => messages[locale][key] || messages.en[key] || key
    const guide = game => {
        const base = guides[locale][game] || guides.en[game]
        const details = guideDetails[locale][game] || guideDetails.en[game]
        return base && details ? {...base, quick: base.rules, ...details} : null
    }
    const href = path => {
        if (explicit !== 'zh' && explicit !== 'en') return path
        const url = new URL(path, root.location.href)
        url.searchParams.set('lang', explicit)
        return url.pathname.split('/').pop() + url.search
    }
    const setLocale = next => {
        const url = new URL(root.location.href)
        url.searchParams.set('lang', next)
        root.location.href = url.href
    }

    if (root.document) root.document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {i18n: {locale, explicit, t, guide, href, setLocale}})
})(globalThis)
