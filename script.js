// --- Socket.IO Setup ---
const SERVER_URL = "https://tttmegabackend.onrender.com"; // Address of your Socket.IO server
let socket; // Will be initialized later

function connectToServer() {
    try {
        console.log(`Attempting to connect to server at ${SERVER_URL}...`);
        socket = io(SERVER_URL);

        // Basic connection listeners
        socket.on('connect', () => {
            console.log('Connected to server with ID:', socket.id);
            // Re-enable buttons that might have been disabled during connection attempt
            createGameButton.disabled = false;
            createGameButton.textContent = "Create New Game";
            joinGameButton.disabled = false;
            joinGameButton.textContent = "Join";
        });

        socket.on('connect_error', (err) => {
            console.error('Connection Error:', err);
            alert(`Failed to connect to the multiplayer server (${SERVER_URL}). Please ensure the server is running and try again.`);
            // Reset UI state if connection fails
            resetJoinButton();
            createGameButton.textContent = "Create New Game";
            createGameButton.disabled = false;
        });

        socket.on('disconnect', (reason) => {
            console.log('Disconnected from server:', reason);
            if (gameMode === 'multiplayer') {
                alert("Disconnected from server.");
                cleanupMultiplayerGame(); // Clean up listeners etc.
                resetToLandingPage();
            }
        });

        // --- Add Game-Specific Socket Event Listeners ---
        setupSocketListeners();

    } catch (error) {
         console.error("Socket.IO initialization error:", error);
         alert("Could not initialize connection to multiplayer server. Please try again later.");
    }
}

// --- Constants ---
const GRID_SIZE = 5;
const WINNING_SCORE = 5;
const CONNECT_5_POINTS = 2;
const CONNECT_4_POINTS = 1;
const REMOVAL_TURNS_EACH = 3;
const HIGHLIGHT_DURATION = 800; // ms (slightly faster)
const AI_DELAY = 500; // ms delay for AI move

// --- DOM Elements ---
// Landing page and multiplayer UI elements
const landingPage = document.getElementById('landing-page');
const multiplayerSetup = document.getElementById('multiplayer-setup');
const waitingLobby = document.getElementById('waiting-lobby');
const gameUI = document.getElementById('game-ui');
const playWithBotButton = document.getElementById('play-with-bot');
const playWithHumanButton = document.getElementById('play-with-human');
const createGameButton = document.getElementById('create-game');
const joinGameButton = document.getElementById('join-game');
const backToLandingButton = document.getElementById('back-to-landing');
const playerNameInput = document.getElementById('player-name');
const gameCodeInput = document.getElementById('game-code');
const lobbyCodeElement = document.getElementById('lobby-code');
const copyCodeButton = document.getElementById('copy-code');
const cancelWaitingButton = document.getElementById('cancel-waiting');

// Game UI elements
const gameBoardElement = document.getElementById('game-board');
const scoreXElement = document.getElementById('score-x');
const scoreOElement = document.getElementById('score-o');
const turnIndicatorElement = document.getElementById('turn-indicator');
const messageAreaElement = document.getElementById('message-area');
const resetButton = document.getElementById('reset-button');
const helpButton = document.getElementById('help-button');
const gameContainerElement = document.querySelector('.game-container');
const playerXLabel = document.getElementById('player-x-label');
const playerOLabel = document.getElementById('player-o-label');

// --- App State Variables ---
let gameMode = null; // 'singleplayer' or 'multiplayer'
let gameId = null; // For multiplayer games
let playerName = ''; // User's name in multiplayer
let isPlayerX = true; // Whether the player is X (first player) in multiplayer
let multiplayerTurn = false; // Whether it's this player's turn in multiplayer
let opponentName = ''; // Name of opponent in multiplayer
let socketId = null; // Store this client's socket ID
let multiplayerGameStarted = false; // Track if multiplayer game started

// --- Game State Variables ---
let board = [];
let currentPlayer = 'X'; // X is Human, O is Bot or second player
let scores = { X: 0, O: 0 };
let gameOver = false;
let isRemovalPhase = false;
let removalTurnsLeft = 0;
let playerBeforeBoardFull = null;
let isPlayerTurn = true; // Flag to prevent clicks during AI turn/delay
let processingMove = false; // Flag to prevent overlapping move processing

// --- Event Listeners for Landing Page and Multiplayer Setup ---
playWithBotButton.addEventListener('click', () => {
    gameMode = 'singleplayer';
    landingPage.classList.add('hidden');
    gameUI.classList.remove('hidden');
    initGame();
});

playWithHumanButton.addEventListener('click', () => {
    landingPage.classList.add('hidden');
    multiplayerSetup.classList.remove('hidden');
    if (!socket || !socket.connected) {
        connectToServer(); // Connect when entering multiplayer setup
    }
});

backToLandingButton.addEventListener('click', () => {
    multiplayerSetup.classList.add('hidden');
    landingPage.classList.remove('hidden');
});

createGameButton.addEventListener('click', () => {
    if (!playerNameInput.value.trim()) {
        alert('Please enter your name');
        return;
    }
    
    // Show loading state
    createGameButton.textContent = "Creating...";
    createGameButton.disabled = true;
    
    playerName = playerNameInput.value.trim();
    if (socket && socket.connected) {
        socket.emit('createGame', playerName);
    } else {
        alert("Not connected to server. Please try again.");
        createGameButton.textContent = "Create New Game";
        createGameButton.disabled = false;
    }
});

joinGameButton.addEventListener('click', () => {
    if (!playerNameInput.value.trim()) {
        alert('Please enter your name');
        return;
    }
    
    if (!gameCodeInput.value.trim()) {
        alert('Please enter a game code');
        return;
    }
    
    // Show loading state
    joinGameButton.textContent = "Joining...";
    joinGameButton.disabled = true;
    
    playerName = playerNameInput.value.trim();
    const code = gameCodeInput.value.trim().toUpperCase();
    if (socket && socket.connected) {
         socket.emit('joinGame', { gameId: code, playerName });
    } else {
         alert("Not connected to server. Please try again.");
         resetJoinButton();
    }
});

cancelWaitingButton.addEventListener('click', () => {
    if (gameId) {
        if (socket && socket.connected) {
            socket.emit('cancelGame', gameId); // Inform server if needed
        }
        gameId = null;
    }
    
    waitingLobby.classList.add('hidden');
    multiplayerSetup.classList.remove('hidden');
});

copyCodeButton.addEventListener('click', () => {
    navigator.clipboard.writeText(lobbyCodeElement.textContent)
        .then(() => {
            copyCodeButton.textContent = 'Copied!';
            setTimeout(() => {
                copyCodeButton.textContent = 'Copy';
            }, 2000);
        })
        .catch(err => {
            console.error('Failed to copy: ', err);
        });
});

// --- Multiplayer Functions (Removed Firebase versions) ---
function resetJoinButton() {
    joinGameButton.textContent = "Join";
    joinGameButton.disabled = false;
}

// --- Socket.IO Event Handlers ---
function setupSocketListeners() {
    if (!socket) return;

    // Handle successful game creation
    socket.on('gameCreated', (newGameId) => {
        console.log("Game created successfully with ID:", newGameId);
        gameId = newGameId;
        isPlayerX = true; // Creator is always X
        multiplayerTurn = true; // X goes first initially
        
        // Update player labels immediately (opponent will be updated later)
        playerXLabel.textContent = playerName + " (X)";
        playerOLabel.textContent = "Waiting...";

        // Show the waiting lobby with the game code
        multiplayerSetup.classList.add('hidden');
        waitingLobby.classList.remove('hidden');
        lobbyCodeElement.textContent = gameId;
        
        // Reset button state (might be redundant due to 'connect' handler, but safe)
        createGameButton.textContent = "Create New Game";
        createGameButton.disabled = false;
    });

    // Handle successfully joining a game
    socket.on('gameJoined', (data) => {
        console.log("Successfully joined game:", data);
        gameId = data.gameId;
        opponentName = data.opponentName;
        isPlayerX = false; // Joiner is always O
        multiplayerTurn = data.currentPlayer === 'O'; // Check whose turn it is
        
        // Update player labels
        playerXLabel.textContent = opponentName + " (X)";
        playerOLabel.textContent = playerName + " (O)";
        
        // Show the game UI
        multiplayerSetup.classList.add('hidden');
        gameUI.classList.remove('hidden');
        
        initMultiplayerGame(); // Initialize board UI
        // Apply initial state received from server
        setTimeout(() => updateGameState(data), 0);
        multiplayerGameStarted = true;
    });

    // Handle opponent joining (for the creator)
    socket.on('opponentJoined', (data) => {
        console.log("Opponent joined:", data);
        opponentName = data.opponentName;
        
        // Update player labels
        playerOLabel.textContent = opponentName + " (O)";
        
        // Start the game
        waitingLobby.classList.add('hidden');
        gameUI.classList.remove('hidden');
        
        initMultiplayerGame(); // Initialize board UI
        // Apply initial state received from server (optional, could be handled in gameCreated)
        if(data.initialState) {
           setTimeout(() => updateGameState(data.initialState), 0);
        }
        multiplayerGameStarted = true;
    });

    // Handle game state updates from the server
    socket.on('gameStateUpdate', (newState) => {
        console.log("Received game state update:", newState);
        updateGameState(newState);
    });

    // Handle errors from the server (e.g., joining full game, invalid move)
    socket.on('gameError', (message) => {
        console.error("Game Error:", message);
        alert(message);
        // Reset relevant UI states
        resetJoinButton();
        createGameButton.textContent = "Create New Game";
        createGameButton.disabled = false;
        // Potentially navigate back
        if (waitingLobby.classList.contains('hidden') && gameUI.classList.contains('hidden')) {
            multiplayerSetup.classList.remove('hidden');
        }
    });

    // Handle opponent disconnect
    socket.on('opponentDisconnected', () => {
        console.log("Opponent disconnected");
        if (gameMode === 'multiplayer' && multiplayerGameStarted) {
           showPopupMessage("Your opponent has disconnected.")
            .then(() => {
                cleanupMultiplayerGame();
                resetToLandingPage();
            });
        }
    });

    // Handle reset request from server (or initiated by this client)
    socket.on('resetGame', (newState) => {
        console.log("Resetting game state based on server data");
        updateGameState(newState);
        updateMessage("Game Reset!");
    });

}

// Renamed from previous version to avoid conflict
function updateBoardUIMultiplayer(newBoard) {
    console.log('[updateBoardUIMultiplayer] Updating UI with board:', newBoard);
    if (!gameBoardElement) {
        console.error('[updateBoardUIMultiplayer] gameBoardElement is null!');
        return;
    }
    // Update the UI to match the board state
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const cell = gameBoardElement.querySelector(`[data-row="${r}"][data-col="${c}"]`);
            if (!cell) {
                // This should ideally not happen if initMultiplayerGame worked
                console.warn(`[updateBoardUIMultiplayer] Cell not found for ${r},${c}`);
                continue; 
            }
            const value = newBoard && newBoard[r] && newBoard[r][c] !== undefined ? newBoard[r][c] : null;
            
            // Clear existing classes and content
            cell.textContent = '';
            cell.classList.remove('X', 'O');
            
            // Add new content if needed
            if (value) {
                cell.textContent = value;
                cell.classList.add(value);
            }
        }
    }
     console.log('[updateBoardUIMultiplayer] Finished updating UI.');
}

// Helper function to apply state received from server
function updateGameState(state) {
    if (state.board) {
        updateBoardUIMultiplayer(state.board);
        board = state.board; // Update local board state
    }
    if (state.currentPlayer !== undefined) {
        currentPlayer = state.currentPlayer;
        multiplayerTurn = (isPlayerX && currentPlayer === 'X') || (!isPlayerX && currentPlayer === 'O');
        updateTurnIndicator();
    }
    if (state.scores) {
        scores = state.scores;
        updateScoreDisplay();
    }
    if (state.isRemovalPhase !== undefined) {
        isRemovalPhase = state.isRemovalPhase;
        gameContainerElement.classList.toggle('removal-phase', isRemovalPhase);
    }
    if (state.removalTurnsLeft !== undefined) {
        removalTurnsLeft = state.removalTurnsLeft;
        if (isRemovalPhase && multiplayerTurn) {
            updateMessage(`Remove opponent piece. (${removalTurnsLeft} left)`);
        }
    }
     if (state.playerBeforeBoardFull !== undefined) {
        playerBeforeBoardFull = state.playerBeforeBoardFull;
    }
    if (state.gameOver !== undefined) {
        gameOver = state.gameOver;
        if (gameOver) {
            const winner = scores.X > scores.O ? 'X' : 'O';
            const winnerName = winner === 'X' ? playerXLabel.textContent : playerOLabel.textContent;
            updateTurnIndicator("Game Over");
            updateMessage(`${winnerName} wins! (${scores.X}-${scores.O})`);
             // Maybe disable board clicks
        }
    }
    if (state.message) { // Allow server to send messages
        updateMessage(state.message);
    }
}

// Function to clean up Socket.IO listeners (if needed, though disconnect usually handles it)
function cleanupMultiplayerGame() {
    console.log("Cleaning up multiplayer game state and listeners...");
    // Optional: Explicitly remove listeners if managing them manually
    // socket.off('gameCreated');
    // socket.off('gameJoined');
    // socket.off('opponentJoined');
    // socket.off('gameStateUpdate');
    // socket.off('gameError');
    // socket.off('opponentDisconnected');
    // socket.off('resetGame');
    
    // Clear game state
    gameId = null;
    multiplayerGameStarted = false;
    gameMode = null;
    // Don't disconnect the socket here, let it persist unless the app closes
}

function resetToLandingPage() {
    // Hide all game containers
    gameUI.classList.add('hidden');
    waitingLobby.classList.add('hidden');
    multiplayerSetup.classList.add('hidden');
    
    // Show landing page
    landingPage.classList.remove('hidden');
}

// Handle page unload to clean up Socket.IO listeners
window.addEventListener('beforeunload', () => {
    // Socket disconnect is handled automatically by browser closing
    // If we wanted to notify the server on page close:
    if (socket && socket.connected && gameId) {
        socket.emit('leaveGame', gameId);
    }
});

// Add event listener for cell clicks
// Removed - added in init functions instead
// gameBoardElement.addEventListener('click', handleMultiplayerCellClick);

function handleMultiplayerCellClick(event) {
    // Only allow clicks during player's turn, not game over, and directly on a cell
    if (!multiplayerTurn || gameOver || !event.target.classList.contains('cell') || processingMove) return;

    const cell = event.target;
    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);

    // Prevent further clicks while processing
    processingMove = true;

    // Determine the action based on game phase
    const moveData = {
        row: row,
        col: col,
        isRemoval: isRemovalPhase
    };

    // Send the move to the server
    console.log(`Sending move to server: ${JSON.stringify(moveData)}`);
    if (socket && socket.connected) {
         socket.emit('makeMove', { gameId, moveData });
    } else {
        alert("Not connected to server. Cannot make move.");
         processingMove = false; // Allow clicks again if failed
        return;
    }

    // The UI update will now happen when the 'gameStateUpdate' event is received from the server.
    // We can optionally provide immediate local feedback, but the server is the source of truth.
     // For example, you could tentatively place the piece locally and show a loading state,
     // but it will be corrected by the server's update.

    // Re-enable processing after a short delay or rely on server confirmation
     // For simplicity, let server response implicitly handle re-enabling via multiplayerTurn flag
    processingMove = false; // Simplified: Re-enable immediately. Server state will ultimately control turns.
}

// Multiplayer reset handler
function handleMultiplayerReset() {
    if (gameMode !== 'multiplayer' || !gameId) return;
    if (confirm("Are you sure you want to request a game reset?")) {
        if (socket && socket.connected) {
            console.log("Requesting game reset from server...");
            socket.emit('requestReset', gameId);
        } else {
            alert("Not connected to server.");
        }
    }
}

// --- Helper Function for Popup Messages ---
function showPopupMessage(message) {
    return new Promise((resolve) => {
        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'popup-overlay';
        document.body.appendChild(overlay);

        // Create popup element
        const popup = document.createElement('div');
        popup.className = 'popup-message';

        const messageText = document.createElement('p');
        messageText.className = 'popup-message-text';
        messageText.textContent = message;

        const confirmButton = document.createElement('button');
        confirmButton.className = 'popup-button';
        confirmButton.textContent = 'OK';
        
        confirmButton.addEventListener('click', () => {
            document.body.removeChild(popup);
            document.body.removeChild(overlay);
            resolve();
        });

        popup.appendChild(messageText);
        popup.appendChild(confirmButton);
        document.body.appendChild(popup);
    });
}

// --- Initialization ---
function initGame() {
    gameMode = 'singleplayer';
    board = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
    currentPlayer = 'X';
    scores = { X: 0, O: 0 };
    gameOver = false;
    isRemovalPhase = false;
    removalTurnsLeft = 0;
    playerBeforeBoardFull = null;
    isPlayerTurn = true; // Player X starts
    processingMove = false; // Reset processing flag
    gameContainerElement.classList.remove('removal-phase');

    gameBoardElement.innerHTML = '';
    gameBoardElement.removeEventListener('click', handleCellClick);
    gameBoardElement.removeEventListener('click', handleMultiplayerCellClick);

    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cell.dataset.row = r;
            cell.dataset.col = c;
            gameBoardElement.appendChild(cell);
        }
    }

    gameBoardElement.addEventListener('click', handleCellClick);
    resetButton.removeEventListener('click', initGame);
    resetButton.removeEventListener('click', handleMultiplayerReset);
    resetButton.addEventListener('click', initGame);

    helpButton.removeEventListener('click', showInstructions);
    helpButton.addEventListener('click', showInstructions);

    // Reset player labels
    playerXLabel.textContent = 'Player';
    playerOLabel.textContent = 'Bot';

    updateScoreDisplay();
    updateTurnIndicator();
    updateMessage("");
}

// Add a separate init function for multiplayer to avoid confusion
function initMultiplayerGame() {
    gameMode = 'multiplayer';
    // Reset local game state variables that might be stale
    // Board, scores, currentPlayer, etc., will be set by server's gameStateUpdate
    gameOver = false;
    isRemovalPhase = false;
    removalTurnsLeft = 0;
    playerBeforeBoardFull = null;
    processingMove = false;
    gameContainerElement.classList.remove('removal-phase');
    
    // Clear the board UI first
    gameBoardElement.innerHTML = ''; 
    console.log('[initMultiplayerGame] Cleared game board innerHTML');
    // Remove previous listeners first to prevent duplicates
    gameBoardElement.removeEventListener('click', handleCellClick);
    gameBoardElement.removeEventListener('click', handleMultiplayerCellClick);
    
    // Create the board cells
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cell.dataset.row = r;
            cell.dataset.col = c;
            // console.log(`[initMultiplayerGame] Creating cell ${r},${c}`); // Optional: Uncomment for very verbose logging
            gameBoardElement.appendChild(cell);
        }
    }
    console.log('[initMultiplayerGame] Finished creating cells. Child count:', gameBoardElement.childElementCount);
    
    // Add the correct event listener for multiplayer
    gameBoardElement.addEventListener('click', handleMultiplayerCellClick);
    
    // Setup reset button for multiplayer (needs server interaction)
    resetButton.removeEventListener('click', initGame);
    resetButton.removeEventListener('click', handleMultiplayerReset); // Remove potential old listener
    resetButton.addEventListener('click', handleMultiplayerReset);
    
    // Setup help button (remains the same)
    helpButton.removeEventListener('click', showInstructions); // Remove potential old listener
    helpButton.addEventListener('click', showInstructions);
    
    // UI updates like scores and turn indicator will be handled by updateGameState
    updateMessage(""); 
}

// --- Event Handlers ---
function handleCellClick(event) {
    // Only allow clicks during player's turn, not game over, and directly on a cell
    if (!isPlayerTurn || gameOver || !event.target.classList.contains('cell')) return;

    const cell = event.target;
    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);

    if (isRemovalPhase) {
        // Human player (X) removes an O piece
        if (currentPlayer === 'X') {
            handlePlayerRemovalClick(cell, row, col);
        }
        // AI removal is handled separately
    } else {
        // Normal gameplay click by human player (X)
        if (currentPlayer === 'X') {
            handleNormalPlayClick(cell, row, col);
        }
    }
}

/**
 * Handles clicks during the normal gameplay phase for the Human player (X).
 */
function handleNormalPlayClick(cell, row, col) {
    if (board[row][col] !== null) {
        updateMessage("Cell already taken");
        setTimeout(() => updateMessage(""), 1500);
        return;
    }

    placeSymbol(cell, row, col, 'X');
    processMoveResult(row, col, 'X'); // Process the result of the move

    // If game isn't over and it's now O's turn, trigger AI
    if (!gameOver && currentPlayer === 'O') {
        if (gameMode === 'singleplayer') {
            triggerAIMove();
        }
    }
}

/**
 * Handles clicks during the removal phase for the Human player (X).
 */
function handlePlayerRemovalClick(cell, row, col) {
    const opponent = 'O'; // Human (X) removes Bot (O)

    if (board[row][col] === opponent) {
        removeSymbol(row, col); // Remove the symbol
        removalTurnsLeft--;

        if (removalTurnsLeft === 0) {
            endRemovalPhase();
        } else {
            // Switch to AI's removal turn
            switchPlayer();
            updateTurnIndicator();
            updateMessage(`Remove opponent piece. (${removalTurnsLeft} left)`);
            if (gameMode === 'singleplayer') {
                triggerAIRemoval(); // Trigger AI removal
            }
        }
    } else {
        updateMessage("Click on an opponent's piece to remove");
        setTimeout(() => {
            if (isRemovalPhase && currentPlayer === 'X') { // Check if still in removal phase before updating message
               updateMessage(`Remove opponent piece. (${removalTurnsLeft} left)`);
            }
        }, 1500);
    }
}

// --- Game Logic Functions ---

/**
 * Places a player's symbol on the board array and updates the UI.
 */
function placeSymbol(cellElement, row, col, player) {
    board[row][col] = player;
    // If cellElement is not provided (e.g., AI move), find it
    if (!cellElement) {
         cellElement = gameBoardElement.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    }
    if (cellElement) {
        cellElement.textContent = player;
        cellElement.classList.add(player);
    }
}

 /**
 * Removes a symbol from the board array and updates the UI.
 * @param {number} row - The row index.
 * @param {number} col - The column index.
 */
function removeSymbol(row, col) {
    const player = board[row][col];
    if (player) {
        board[row][col] = null;
        const cellElement = gameBoardElement.querySelector(`[data-row="${row}"][data-col="${col}"]`);
        if (cellElement) {
            cellElement.textContent = '';
            cellElement.classList.remove(player);
        }
    }
}

/**
 * Processes the result of a move and handles scoring animations.
 */
function processMoveResult(row, col, player) {
    isPlayerTurn = false; // Disable input during scoring check
    processingMove = true; // Set flag to indicate we're processing a move
    
    // Check for connect-5 first (it takes precedence over connect-4)
    const win5 = checkWin(row, col, 5);
    if (win5) {
        updateScore(player, CONNECT_5_POINTS);
        const message = `${player === 'X' ? 'Player' : 'Bot'} scores ${CONNECT_5_POINTS}! (Connect 5)`;
        
        showPopupMessage(message).then(() => {
            if (scores[player] >= WINNING_SCORE) {
                gameOver = true;
                const finalMessage = `${player === 'X' ? 'Player' : 'Bot'} wins! (${scores.X}-${scores.O})`;
                showPopupMessage(finalMessage);
                updateMessage(finalMessage);
                updateTurnIndicator("Game Over");
                processingMove = false; // Clear flag
                return;
            }

            highlightAndClearCells(win5.cells);
            currentPlayer = player; // Keep same player for bonus turn
            updateTurnIndicator(`${player === 'X' ? 'Player' : 'Bot'} (Bonus)`);
            
            // Only trigger AI if it's O's turn and game isn't over
            // But use a longer delay to ensure animation completes
            if (gameMode === 'singleplayer' && player === 'O' && !gameOver) {
                setTimeout(() => {
                    processingMove = false; // Clear flag before making next move
                    if (!gameOver && currentPlayer === 'O') {
                        triggerAIMove();
                    }
                }, HIGHLIGHT_DURATION + 500); // Wait for highlight and clear to finish plus a buffer
            } else {
                processingMove = false; // Clear flag
                isPlayerTurn = (player === 'X');
            }
        });
        return;
    }

    // If no connect-5, check for connect-4
    const win4 = checkWin(row, col, 4);
    if (win4) {
        updateScore(player, CONNECT_4_POINTS);
        const message = `${player === 'X' ? 'Player' : 'Bot'} scores ${CONNECT_4_POINTS}! (Connect 4)`;
        
        showPopupMessage(message).then(() => {
            if (scores[player] >= WINNING_SCORE) {
                gameOver = true;
                const finalMessage = `${player === 'X' ? 'Player' : 'Bot'} wins! (${scores.X}-${scores.O})`;
                showPopupMessage(finalMessage);
                updateMessage(finalMessage);
                updateTurnIndicator("Game Over");
                processingMove = false; // Clear flag
                return;
            }

            highlightAndClearCells(win4.cells);
            currentPlayer = player; // Keep same player for bonus turn
            updateTurnIndicator(`${player === 'X' ? 'Player' : 'Bot'} (Bonus)`);
            
            // Only trigger AI if it's O's turn and game isn't over
            // But use a longer delay to ensure animation completes
            if (gameMode === 'singleplayer' && player === 'O' && !gameOver) {
                setTimeout(() => {
                    processingMove = false; // Clear flag before making next move
                    if (!gameOver && currentPlayer === 'O') {
                        triggerAIMove();
                    }
                }, HIGHLIGHT_DURATION + 500); // Wait for highlight and clear to finish plus a buffer
            } else {
                processingMove = false; // Clear flag
                isPlayerTurn = (player === 'X');
            }
        });
        return;
    }

    // No scoring - check for board full or continue normal play
    if (isBoardFull()) {
        startRemovalPhase();
        processingMove = false; // Clear flag
    } else {
        switchPlayer();
        updateTurnIndicator();
        updateMessage("");
        
        // Only trigger AI if it's their turn and not in any special state
        if (gameMode === 'singleplayer' && currentPlayer === 'O' && !gameOver && !isRemovalPhase) {
            processingMove = false; // Ensure flag is cleared before timeout
            setTimeout(() => {
                if (gameMode === 'singleplayer' && !gameOver && currentPlayer === 'O' && !isRemovalPhase) {
                    isPlayerTurn = false;
                    triggerAIMove();
                }
            }, AI_DELAY);
        } else {
            processingMove = false; // Clear flag
            isPlayerTurn = true;
        }
    }
}

/**
 * Shows game instructions in a popup.
 */
function showInstructions() {
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'popup-overlay';
    document.body.appendChild(overlay);

    // Create popup element
    const popup = document.createElement('div');
    popup.className = 'popup-message';
    popup.style.maxWidth = '400px';
    popup.style.maxHeight = '80vh';
    popup.style.overflowY = 'auto';

    const instructionsContent = document.createElement('div');
    instructionsContent.className = 'instructions-content';
    instructionsContent.innerHTML = `
        <h3>How to Play</h3>
        <ul>
            <li>Take turns placing X or O on a 5×5 grid</li>
            <li>Connect 4 in a row to score 1 point</li>
            <li>Connect 5 in a row to score 2 points</li>
            <li>When you score, the connected pieces are removed and you get another turn</li>
        </ul>
        
        <h3>Special Rules</h3>
        <ul>
            <li>If the board fills up completely, players take turns removing 3 of the opponent's pieces</li>
            <li>First player to reach 5 points wins</li>
        </ul>
    `;

    const closeButton = document.createElement('button');
    closeButton.className = 'popup-button';
    closeButton.textContent = 'Close';
    
    closeButton.addEventListener('click', () => {
        document.body.removeChild(popup);
        document.body.removeChild(overlay);
    });

    popup.appendChild(instructionsContent);
    popup.appendChild(closeButton);
    document.body.appendChild(popup);
}

/**
 * Checks for a win condition (connect 4 or 5) originating from the last move.
 * (Code identical to previous version, comments removed for brevity)
 */
 function checkWin(lastRow, lastCol, connectLength) {
    const player = board[lastRow][lastCol];
    if (!player) return null;

    const directions = [ { dr: 0, dc: 1 }, { dr: 1, dc: 0 }, { dr: 1, dc: 1 }, { dr: 1, dc: -1 } ];

    for (const { dr, dc } of directions) {
        let count = 1;
        let winningCells = [{ r: lastRow, c: lastCol }];
        // Check positive direction
        for (let i = 1; i < connectLength; i++) {
            const r = lastRow + i * dr; const c = lastCol + i * dc;
            if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE && board[r][c] === player) {
                count++; winningCells.push({ r, c });
            } else break;
        }
        // Check negative direction
        for (let i = 1; i < connectLength; i++) {
            const r = lastRow - i * dr; const c = lastCol - i * dc;
            if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE && board[r][c] === player) {
                count++; winningCells.push({ r, c });
            } else break;
        }
        // Check if exactly the required length match was found
        if (count === connectLength) {
            return { cells: winningCells };
        }
    }
    return null;
}

/**
 * Highlights the winning cells briefly, then clears them.
 * Disables player input during the highlight/clear animation.
 */
function highlightAndClearCells(cells) {
    isPlayerTurn = false; // Disable input during animation
    const cellElements = [];
    cells.forEach(({ r, c }) => {
        const cellElement = gameBoardElement.querySelector(`[data-row="${r}"][data-col="${c}"]`);
        if (cellElement) {
            cellElement.classList.add('highlight');
            cellElements.push(cellElement);
        }
    });

    setTimeout(() => {
        cells.forEach(({ r, c }) => {
            removeSymbol(r, c); // Use removeSymbol to clear board and UI
            const cellElement = gameBoardElement.querySelector(`[data-row="${r}"][data-col="${c}"]`);
            if (cellElement) {
                cellElement.classList.remove('highlight'); // Ensure highlight is removed
            }
        });
        // After clearing, explicitly set the turn flag based on the current game state
        if (gameOver) {
            isPlayerTurn = false;
        } else {
            isPlayerTurn = (currentPlayer === 'X');
        }
    }, HIGHLIGHT_DURATION);
}

function updateScore(player, points) {
    scores[player] += points;
    updateScoreDisplay();
}

function isBoardFull() {
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            if (board[r][c] === null) return false;
        }
    }
    return true;
}

function startRemovalPhase() {
    isRemovalPhase = true;
    removalTurnsLeft = REMOVAL_TURNS_EACH * 2;
    playerBeforeBoardFull = currentPlayer;
    currentPlayer = 'X'; // Player X always starts removal phase
    isPlayerTurn = true; // Human (X) starts removal
    gameContainerElement.classList.add('removal-phase');

    updateMessage(`Board full! Remove opponent piece. (${REMOVAL_TURNS_EACH * 2} left)`);
    updateTurnIndicator("Remove: Player");
}

function endRemovalPhase() {
    isRemovalPhase = false;
    gameContainerElement.classList.remove('removal-phase');
    
    // After removal phase, the player who didn't play last before board was full goes next
    currentPlayer = playerBeforeBoardFull === 'X' ? 'O' : 'X';
    playerBeforeBoardFull = null;
    isPlayerTurn = (currentPlayer === 'X'); // Set turn correctly
    
    updateMessage("Removal phase over. Play resumes.");
    updateTurnIndicator();
    
    // If it's AI's turn to resume play
    if (gameMode === 'singleplayer' && currentPlayer === 'O' && !gameOver) {
        setTimeout(() => {
            if (!gameOver && currentPlayer === 'O') {
                triggerAIMove();
            }
        }, AI_DELAY);
    }
}

// --- UI Update Functions ---
function updateScoreDisplay() {
    scoreXElement.textContent = scores.X;
    scoreOElement.textContent = scores.O;
    
    // Highlight active player's score box
    document.getElementById('player-x-box').classList.toggle('active', currentPlayer === 'X');
    document.getElementById('player-o-box').classList.toggle('active', currentPlayer === 'O');
}

function updateTurnIndicator(overrideText = null) {
    if (gameOver) {
         turnIndicatorElement.textContent = "Game Over";
    } else if (overrideText) {
        turnIndicatorElement.textContent = overrideText;
    } else {
        let playerText;
        if (gameMode === 'singleplayer') {
            playerText = currentPlayer === 'X' ? 'Player' : 'Bot';
        } else { // Multiplayer mode
            // Use stored names. Ensure names are updated correctly when game starts.
            const currentName = currentPlayer === 'X' ? (isPlayerX ? playerName : opponentName) : (isPlayerX ? opponentName : playerName);
            playerText = currentName || (currentPlayer === 'X' ? 'Player X' : 'Player O'); // Fallback names
        }
        const phaseText = isRemovalPhase ? 'Remove: ' : '';
        turnIndicatorElement.textContent = `${phaseText}${playerText}\'s Turn`;
    }
}

function updateMessage(message) {
    messageAreaElement.textContent = message;
}

// --- AI Logic ---

/**
 * Triggers a single AI move.
 */
function triggerAIMove() {
    // Ensure AI only runs in single player mode
    if (gameMode !== 'singleplayer') return;

    // Remove processingMove check here, caller should manage
    if (gameOver || isRemovalPhase || currentPlayer !== 'O') {
        return; // Ensure AI only plays when it's its turn and no move is being processed
    }

    isPlayerTurn = false; // Lock out player input during AI's turn
    updateTurnIndicator("Bot thinking...");

    setTimeout(() => {
        if (gameOver || isRemovalPhase || currentPlayer !== 'O') {
            isPlayerTurn = (currentPlayer === 'X');
            return;
        }

        const move = getAIMove();
        if (move) {
            placeSymbol(null, move.row, move.col, 'O');
            // Note: processMoveResult will handle triggering another AI move
            // if needed for bonus turn after connect-4 or connect-5
            processMoveResult(move.row, move.col, 'O');
        } else {
            console.error("AI could not find a valid move.");
            switchPlayer();
            isPlayerTurn = true;
            updateTurnIndicator();
        }
    }, AI_DELAY);
}

/**
 * Triggers the AI's removal move after a short delay.
 */
function triggerAIRemoval() {
    // Ensure AI only runs in single player mode
    if (gameMode !== 'singleplayer') return;
    
    // Remove processingMove check here, caller should manage
    if (gameOver || !isRemovalPhase || currentPlayer !== 'O') return;
    
    isPlayerTurn = false; // Disable human input
    updateTurnIndicator("Bot removing...");
    setTimeout(() => {
        if (gameOver || !isRemovalPhase) return; // Check state again

        const removalTarget = getAIRemovalMove();
        if (removalTarget) {
            removeSymbol(removalTarget.row, removalTarget.col); // Remove the targeted X
            removalTurnsLeft--;

            if (removalTurnsLeft === 0) {
                endRemovalPhase();
            } else {
                // Switch back to Player X's removal turn
                switchPlayer();
                updateTurnIndicator();
                updateMessage(`Remove opponent piece. (${removalTurnsLeft} left)`);
                isPlayerTurn = true; // Enable human input for removal
            }
        } else {
             console.error("AI could not find a piece to remove.");
             // Failsafe: End removal phase? Or just skip turn? Let's skip turn for now.
             switchPlayer(); // Switch back to Player X
             updateTurnIndicator();
             updateMessage(`Remove opponent piece. (${removalTurnsLeft} left)`);
             isPlayerTurn = true;
        }
    }, AI_DELAY);
}

/**
 * Determines the best move for the AI (Bot O).
 * Follows the prioritized strategy.
 * @returns {object | null} - The {row, col} of the best move, or null if no move found.
 */
function getAIMove() {
    const opponent = 'X';
    const aiPlayer = 'O';

    // 1. Win Immediately (5-in-a-row)
    let move = findWinningMove(aiPlayer, 5);
    if (move) return move;

    // 2. Win Immediately (4-in-a-row)
    move = findWinningMove(aiPlayer, 4);
    if (move) return move;

    // 3. Block Opponent's Immediate Win (5-in-a-row)
    move = findWinningMove(opponent, 5); // Find where opponent *would* win
    if (move) return move; // Block it

    // 4. Block Opponent's Immediate Win (4-in-a-row)
    move = findWinningMove(opponent, 4); // Find where opponent *would* win
    if (move) return move; // Block it

    // --- More Advanced Strategy (Optional - Simplified for now) ---
    // 5. Set Up Own Win (e.g., create two threats) - Complex, skipping for now
    // 6. Block Opponent's Setup - Complex, skipping for now

    // 7. Heuristic/Positional Play (Fallback)
    move = findHeuristicMove(aiPlayer);
    if (move) return move;

    // 8. Absolute Fallback: Find any empty cell (should always find one if board not full)
    const emptyCells = getEmptyCells();
    if (emptyCells.length > 0) {
        return emptyCells[Math.floor(Math.random() * emptyCells.length)]; // Random empty cell
    }

    return null; // Should not be reached if board isn't full
}

/**
 * Finds a move for the specified player to achieve connectLength.
 * @param {string} player - 'X' or 'O'.
 * @param {number} connectLength - 4 or 5.
 * @returns {object | null} - The {row, col} of the winning/blocking move, or null.
 */
function findWinningMove(player, connectLength) {
    const emptyCells = getEmptyCells();
    for (const { row, col } of emptyCells) {
        // Temporarily place the piece
        board[row][col] = player;
        // Check if this move wins
        if (checkWin(row, col, connectLength)) {
            // Found a winning move, undo temporary placement and return
            board[row][col] = null;
            return { row, col };
        }
        // Undo temporary placement
        board[row][col] = null;
    }
    return null; // No immediate winning move found
}

/**
 * Finds a heuristic move (center preferred, then random).
 * @param {string} player - The AI player ('O').
 * @returns {object | null} - The {row, col} of the heuristic move, or null.
 */
function findHeuristicMove(player) {
    const emptyCells = getEmptyCells();
    if (emptyCells.length === 0) return null;

    // Prioritize center cells
    const centerCoords = [
        {row: 2, col: 2},
        {row: 1, col: 2}, {row: 2, col: 1}, {row: 2, col: 3}, {row: 3, col: 2},
        {row: 1, col: 1}, {row: 1, col: 3}, {row: 3, col: 1}, {row: 3, col: 3}
    ];

    for (const {row, col} of centerCoords) {
        if (board[row][col] === null) {
            // Simple check: ensure this move doesn't immediately let opponent win
            board[row][col] = player; // Temporarily place AI piece
            const opponentWinsNext = findWinningMove('X', 5) || findWinningMove('X', 4);
            board[row][col] = null; // Undo temporary placement

            if (!opponentWinsNext) {
                 return { row, col }; // Safe heuristic move
            }
        }
    }

    // If center cells are taken or unsafe, try adjacent to own pieces (simplified: just take any empty)
    // A more complex heuristic would check adjacency or potential line building.
    // For now, fall back to a random valid move from the remaining empty cells.

     const safeMoves = emptyCells.filter(({row, col}) => {
         board[row][col] = player;
         const opponentWinsNext = findWinningMove('X', 5) || findWinningMove('X', 4);
         board[row][col] = null;
         return !opponentWinsNext;
     });

     if (safeMoves.length > 0) {
         return safeMoves[Math.floor(Math.random() * safeMoves.length)];
     } else if (emptyCells.length > 0) {
         // If no move is "safe" (meaning opponent has a forced win), just make any move.
         return emptyCells[Math.floor(Math.random() * emptyCells.length)];
     }


    return null; // No empty cells left
}


/**
 * Gets a list of all empty cells on the board.
 * @returns {Array<object>} - An array of {row, col} objects.
 */
function getEmptyCells() {
    const cells = [];
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            if (board[r][c] === null) {
                cells.push({ row: r, col: c });
            }
        }
    }
    return cells;
}

/**
 * Determines the best opponent piece ('X') for the AI ('O') to remove.
 * @returns {object | null} - The {row, col} of the piece to remove, or null.
 */
function getAIRemovalMove() {
    const opponent = 'X';
    const opponentCells = [];
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            if (board[r][c] === opponent) {
                opponentCells.push({ row: r, col: c });
            }
        }
    }

    if (opponentCells.length === 0) return null; // No opponent pieces to remove

    // Strategy:
    // 1. Find if removing a piece prevents an immediate opponent win (4 or 5 in a row setup).
    //    Check if any opponent piece is part of a line of 3 or 4 opponent pieces
    //    with empty spaces that could complete the line. Removing such a piece is high priority.
    //    (This is complex to check perfectly, simplify for now)

    // Simplified Strategy:
    // 1. Remove a piece that breaks the longest potential line for the opponent.
    //    (Check lines of 3 or more)
    // 2. Fallback: Remove a random opponent piece.

    let bestCellToRemove = null;
    let maxLineLengthBroken = 0;

    for (const { row, col } of opponentCells) {
         // Temporarily remove the piece to see its impact
         board[row][col] = null; // Simulate removal

         // Check opponent's potential *after* removal (less potential is better)
         // A simple proxy: check the length of the longest line X *could* make now
         // This is still complex. Let's simplify further:
         // Just find which X is part of the longest *current* line of X's

         // Reset simulation
         board[row][col] = opponent;

         // Check current lines involving this piece
         const currentLineLength = getMaxLineLengthContaining(row, col, opponent);
         if (currentLineLength > maxLineLengthBroken) {
             maxLineLengthBroken = currentLineLength;
             bestCellToRemove = { row, col };
         }
    }

     // If we found a piece breaking a line of 2 or more, remove it
    if (bestCellToRemove && maxLineLengthBroken >= 2) {
         return bestCellToRemove;
    }

    // Fallback: Remove a random opponent piece
    return opponentCells[Math.floor(Math.random() * opponentCells.length)];
}

 /**
 * Helper for AI Removal: Finds the maximum length of a continuous line
 * (horizontal, vertical, diagonal) of the specified player's pieces
 * that includes the given cell (r, c).
 * @param {number} r - Row index.
 * @param {number} c - Column index.
 * @param {string} player - 'X' or 'O'.
 * @returns {number} - The length of the longest line containing (r, c).
 */
function getMaxLineLengthContaining(r, c, player) {
    let maxLength = 0;
    const directions = [ { dr: 0, dc: 1 }, { dr: 1, dc: 0 }, { dr: 1, dc: 1 }, { dr: 1, dc: -1 } ];

    for (const { dr, dc } of directions) {
        let currentLength = 1; // Start with the piece itself
        // Check positive direction
        for (let i = 1; i < GRID_SIZE; i++) {
            const nr = r + i * dr; const nc = c + i * dc;
            if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE && board[nr][nc] === player) {
                currentLength++;
            } else break;
        }
        // Check negative direction
        for (let i = 1; i < GRID_SIZE; i++) {
            const nr = r - i * dr; const nc = c - i * dc;
             if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE && board[nr][nc] === player) {
                currentLength++;
            } else break;
        }
        maxLength = Math.max(maxLength, currentLength);
    }
    return maxLength;
}

/**
 * Switches the current player from X to O or vice versa.
 */
function switchPlayer() {
    currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
    isPlayerTurn = (currentPlayer === 'X'); // Set the player turn flag based on current player
}

// --- DOMContentLoaded Listener ---
window.addEventListener('DOMContentLoaded', () => {
    // Hide all game UI sections initially, show landing page
    landingPage.classList.remove('hidden');
    multiplayerSetup.classList.add('hidden');
    waitingLobby.classList.add('hidden');
    gameUI.classList.add('hidden');

     // Add exit button to header buttons (do this once)
    if (!document.getElementById('exit-button')) { // Prevent adding multiple times
        const exitButton = document.createElement('button');
        exitButton.id = 'exit-button'; // Give it an ID
        exitButton.className = 'icon-button';
        exitButton.title = 'Exit to Main Menu';
        exitButton.textContent = '←';
        exitButton.addEventListener('click', () => {
            const confirmExit = confirm('Are you sure you want to exit to the main menu?');
            if (confirmExit) {
                if (gameMode === 'multiplayer' && socket && socket.connected && gameId) {
                    socket.emit('leaveGame', gameId); // Notify server
                }
                cleanupMultiplayerGame(); // Clean up client state
                resetToLandingPage();
            }
        });
        document.querySelector('.header-buttons').prepend(exitButton);
    }
}); 
