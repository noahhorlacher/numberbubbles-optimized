// Canvas setup
const canvas = document.querySelector('#gameCanvas');
const context = canvas.getContext('2d');
const width = canvas.getAttribute('width');
const height = canvas.getAttribute('height');

// Game configuration
const BALL_RADIUS = 20;
const BORDER_LIMIT = 620;
const NUM_OBSTACLES = 15;
const SHOOT_SPEED_DIVISOR = 10;
const BACKGROUND_COLOR = 'rgb(32, 32, 32)'
const MINIMUM_OBSTACLE_RADIUS = 20

// Game state
let gravity = 0.2;
let bounce = 0.8;
let gameover = false;
let game;
let animationFrame;

// UI elements
const mousePosition = { x: 0, y: 0 };
const bounceValueElement = document.querySelector('#bounceValue');
const gravityValueElement = document.querySelector('#gravityValue');
const bounceRange = document.querySelector('#bounce');
const gravityRange = document.querySelector('#gravity');
const triesElement = document.getElementById('tries');
const doneTextElement = document.querySelector('h2.doneText');

// Event listeners
document.getElementById('resetButton').addEventListener('click', startGame);
bounceValueElement.innerText = `${bounceRange.value}%`;
gravityValueElement.innerText = `${gravityRange.value}%`;

// Vector class for position and velocity calculations
class Vector {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    rotate(forward, angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        
        if (forward) {
            const x = this.x * cos + this.y * sin;
            const y = this.y * cos - this.x * sin;
            this.x = x;
            this.y = y;
        } else {
            const x = this.x * cos - this.y * sin;
            const y = this.y * cos + this.x * sin;
            this.x = x;
            this.y = y;
        }
    }
}

// Base circle class for game objects
class Circle {
    constructor(x, y, radius) {
        this.position = new Vector(x, y);
        this.radius = radius;
    }
}

// Obstacle class for targets
class Obstacle extends Circle {
    constructor(x, y, radius, r, g, b) {
        super(x, y, radius);
        this.number = 10;
        this.color = { r, g, b };
    }

    draw(ball) {
        if (this.number <= 0) return;

        // Draw obstacle circle
        context.beginPath();
        context.lineWidth = 2;
        context.strokeStyle = `rgb(${this.color.r}, ${this.color.g}, ${this.color.b})`;
        context.arc(this.position.x, this.position.y, this.radius, 0, 2 * Math.PI);
        context.stroke();

        // Draw number inside obstacle
        context.fillStyle = `rgb(${this.color.r}, ${this.color.g}, ${this.color.b})`;
        context.font = `${this.radius/2}px Arial`;
        const fontOffset = this.number.toString().length > 1 ? this.radius/6 : this.radius/3;
        context.fillText(this.number, this.position.x - this.radius/2 + fontOffset, this.position.y + this.radius/6);

        this.checkBallCollision(ball);
    }

    checkBallCollision(ball) {
        const distance = getDistance(ball.position, this.position);
        
        if (distance < ball.radius + this.radius) {
            this.handleCollision(ball, distance);
            this.number--;
        }
    }

    handleCollision(ball, distance) {
        const overlap = ball.radius + this.radius - distance;
        const angle = Math.atan2(ball.position.y - this.position.y, ball.position.x - this.position.x);

        // Rotate positions and velocity for collision calculation
        ball.position.rotate(true, angle);
        this.position.rotate(true, angle);
        ball.speed.rotate(true, angle);

        // Adjust positions to prevent overlap
        ball.position.x += ball.position.x > this.position.x ? overlap : -overlap;
        ball.speed.x = -ball.speed.x * bounce;

        // Rotate back
        ball.position.rotate(false, angle);
        this.position.rotate(false, angle);
        ball.speed.rotate(false, angle);
    }
}

// Ball class for player-controlled object
class GameBall extends Circle {
    constructor() {
        super(width/2, BALL_RADIUS, BALL_RADIUS);
        this.speed = new Vector(0, 0);
        this.shootable = true;
    }

    draw(game) {
        context.beginPath();
        context.fillStyle = "cadetblue";
        context.arc(this.position.x, this.position.y, this.radius, 0, 2 * Math.PI);
        context.fill();
        this.update(game);
    }

    update(game) {
        if (this.shootable) {
            this.resetPosition();
        } else {
            this.applyPhysics();
            this.handleBoundaryCollisions();
        }

        if (this.position.y > BORDER_LIMIT) {
            this.shootable = true;
            checkGameCompletion(game);
        }
    }

    resetPosition() {
        this.position.x = width/2;
        this.position.y = this.radius;
        this.speed.x = 0;
        this.speed.y = 0;
    }

    applyPhysics() {
        this.position.x += this.speed.x;
        this.position.y += this.speed.y;
        this.speed.y += gravity;
    }

    handleBoundaryCollisions() {
        // Horizontal boundaries
        if (this.position.x > width - this.radius || this.position.x < this.radius) {
            this.position.x = this.position.x > width - this.radius ? width - this.radius : this.radius;
            this.speed.x = -this.speed.x * bounce;
        }
        
        // Top boundary
        if (this.position.y < this.radius) {
            this.position.y = this.radius;
            this.speed.y = -this.speed.y * bounce;
        }
    }
}

// Game class to manage overall game state
class Game {
    constructor(amountObstacles) {
        this.obstacles = [];
        this.gameball = new GameBall();
        this.tries = 0;
        this.createObstacles(amountObstacles);
    }

    createObstacles(amount) {
        for (let i = 0; i < amount; i++) {
            const color = {
                r: Math.floor(Math.random() * 200 + 55),
                g: Math.floor(Math.random() * 200 + 55),
                b: Math.floor(Math.random() * 200 + 55)
            };
            const radius = MINIMUM_OBSTACLE_RADIUS + Math.random() * 50;
            const x = radius + Math.random() * (width - (2 * radius));
            const y = 80 + radius + Math.random() * (height - (2 * radius) - 80);

            const obstacle = new Obstacle(x, y, radius, color.r, color.g, color.b);
            obstacle.draw(this.gameball);
            this.obstacles.push(obstacle);
            this.checkObstacleOverlap(obstacle);
        }
    }

    checkObstacleOverlap(obstacle) {
        if (this.obstacles.length <= 1) return;

        this.obstacles.forEach(other => {
            if (other === obstacle) return;

            const distance = getDistance(other.position, obstacle.position);
            if (distance < other.radius + obstacle.radius) {
                this.resolveObstacleOverlap(other, obstacle, distance);
            }
        });
    }

    resolveObstacleOverlap(o1, o2, distance) {
        const angle = Math.atan2(o1.position.y - o2.position.y, o1.position.x - o2.position.x);
        const overlap = o1.radius + o2.radius - distance;

        // Rotate, adjust positions, and rotate back
        [o1.position, o2.position].forEach(pos => pos.rotate(true, angle));
        
        if (o1.position.x > o2.position.x) {
            o1.position.x += overlap/2;
            o2.position.x -= overlap/2;
        } else {
            o1.position.x -= overlap/2;
            o2.position.x += overlap/2;
        }

        [o1.position, o2.position].forEach(pos => pos.rotate(false, angle));
    }
}

// Utility functions
function getDistance(pos1, pos2) {
    return Math.sqrt(Math.pow(pos1.x - pos2.x, 2) + Math.pow(pos1.y - pos2.y, 2));
}

function updateCanvas(game) {
    // Clear canvas
    context.fillStyle = BACKGROUND_COLOR;
    context.fillRect(0, 0, width, height);

    // Draw game objects
    game.gameball.draw(game);
    game.obstacles.forEach(obstacle => obstacle.draw(game.gameball));

    // Draw aim arrow when ball is shootable
    if (game.gameball.shootable) {
        drawAimArrow(mousePosition.x, mousePosition.y);
    }
}

function drawAimArrow(x, y) {
    context.beginPath();
    context.strokeStyle = 'white';
    context.lineWidth = 3;
    context.lineCap = 'round';
    context.moveTo(width/2, BALL_RADIUS);
    context.lineTo(x, y);
    context.stroke();
}

function checkGameCompletion(game) {
    const allObstaclesCleared = game.obstacles.every(obstacle => obstacle.number <= 0);

    if (allObstaclesCleared) {
        gameover = true;
        clearCanvas();
        doneTextElement.className = 'doneText done';
        game.gameball.shootable = false
    }
}

function clearCanvas() {
    context.fillStyle = BACKGROUND_COLOR;
    context.fillRect(0, 0, width, height);
}

function resetCanvas() {
    clearCanvas();
    const w = width;
    canvas.width = 1;
    canvas.width = w;
}

// Game control functions
function startGame() {
    resetCanvas();
    gameover = false;
    
    // Reset UI
    doneTextElement.className = 'doneText';
    triesElement.innerHTML = 'Tries: 0';

    // Update game parameters
    bounce = bounceRange.value / 100;
    gravity = gravityRange.value / 100;
    
    // Create new game instance
    game = new Game(NUM_OBSTACLES);

    // Cancel existing animation before starting new one
    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
    }

    // Start game loop
    function gameLoop() {
        if (!gameover) {
            updateCanvas(game);
            animationFrame = requestAnimationFrame(gameLoop);
        }
    }
    animationFrame = requestAnimationFrame(gameLoop);

    // Set up event listeners
    setupEventListeners();
}

function setupEventListeners() {
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleClick);
}

function handleMouseMove(e) {
    const rect = e.target.getBoundingClientRect();
    mousePosition.x = e.clientX - rect.left;
    mousePosition.y = e.clientY - rect.top;
}

function handleClick(e) {
    if (gameover || !game.gameball.shootable) return;

    const rect = e.target.getBoundingClientRect();
    mousePosition.x = e.clientX - rect.left;
    mousePosition.y = e.clientY - rect.top;

    game.gameball.shootable = false;
    game.gameball.speed.x = (mousePosition.x - (width / 2)) / SHOOT_SPEED_DIVISOR;
    game.gameball.speed.y = (mousePosition.y - 20) / SHOOT_SPEED_DIVISOR;
    
    triesElement.innerText = `Tries: ${++game.tries}`;
}

// Initialize the game
startGame();