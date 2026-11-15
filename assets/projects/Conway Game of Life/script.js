// Create the board with a random initial state
const boardSize = 50;
let board = [];
for (let i = 0; i < boardSize; i++) {
  board[i] = [];
  for (let j = 0; j < boardSize; j++) {
    board[i][j] = Math.floor(Math.random() * 2);
  }
}

// Create the table elements and add them to the DOM
const boardTable = document.querySelector('#board');
for (let i = 0; i < boardSize; i++) {
  let row = document.createElement('tr');
  for (let j = 0; j < boardSize; j++) {
    let cell = document.createElement('td');
    cell.setAttribute('data-x', i);
    cell.setAttribute('data-y', j);
    cell.style.backgroundColor = board[i][j] === 1 ? 'black' : 'white';
    row.appendChild(cell);
  }
  boardTable.appendChild(row);
}

// Update the board based on the rules of the game
function updateBoard() {
  let newBoard = [];
  for (let i = 0; i < boardSize; i++) {
    newBoard[i] = [];
    for (let j = 0; j < boardSize; j++) {
      // Count the number of live neighbors of the current cell
      let count = 0;
      if (i > 0 && j > 0 && board[i-1][j-1] === 1) count++;
      if (i > 0 && board[i-1][j] === 1) count++;
      if (i > 0 && j < boardSize-1 && board[i-1][j+1] === 1) count++;
      if (j > 0 && board[i][j-1] === 1) count++;
      if (j < boardSize-1 && board[i][j+1] === 1) count++;
      if (i < boardSize-1 && j > 0 && board[i+1][j-1] === 1) count++;
      if (i < boardSize-1 && board[i+1][j] === 1) count++;
      if (i < boardSize-1 && j < boardSize-1 && board[i+1][j+1] === 1) count++;

      // Apply the rules of the game to update the state of the current cell
      if (board[i][j] === 1 && (count < 2 || count > 3)) {
        newBoard[i][j] = 0; // Any live cell with fewer than two live neighbors dies, as if caused by underpopulation.
      } else if (board[i][j] === 1 && (count === 2 || count === 3)) {
        newBoard[i][j] = 1; // Any live cell with two or three live neighbors
      } else if (board[i][j] === 0 && count === 3) {
        newBoard[i][j] = 1; // Any dead cell with exactly three live neighbors becomes a live cell, as if by reproduction.
      } else {
        newBoard[i][j] = board[i][j]; // All other cells remain in the same state.
      }
    }
  }
  board = newBoard; // Update the board with the new state
}

// Update the display of the board
function updateBoardDisplay() {
  const cells = document.querySelectorAll('#board td');
  cells.forEach(cell => {
    const x = parseInt(cell.getAttribute('data-x'));
    const y = parseInt(cell.getAttribute('data-y'));
    cell.style.backgroundColor = board[x][y] === 1 ? 'green' : 'white';
  });
}

// Start the game
let isPlaying = false;
let intervalId = null;
const playButton = document.createElement('button');
playButton.textContent = 'Play';

playButton.addEventListener('click', () => {
  if (!isPlaying) {
    intervalId = setInterval(() => {
      updateBoard();
      updateBoardDisplay();
    }, 100);
    playButton.textContent = 'Pause';
  } else {
    clearInterval(intervalId);
    playButton.textContent = 'Play';
  }
  isPlaying = !isPlaying;
});

document.body.insertBefore(playButton, boardTable);