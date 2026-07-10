const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// --- Dimensiones Base del Diseño (Resolución Virtual) ---
const VIRTUAL_WIDTH = 640;
const VIRTUAL_HEIGHT = 480;

// Asignamos el tamaño interno del búfer del canvas fijo
canvas.width = VIRTUAL_WIDTH;
canvas.height = VIRTUAL_HEIGHT;

// --- Estado de Pausa y Niveles ---
let isPaused = false;
let currentLevel = 1;
const MAX_LEVELS = 3;

// --- Sistema de Audio Procedural (Web Audio API) ---
let audioCtx = null;
let bgmInterval = null;

function initAudio() {
    if (audioCtx) return; 
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    startBGM();
}

function startBGM() {
    const notes = [261.63, 293.66, 329.63, 392.00, 349.23, 329.63, 293.66, 261.63]; 
    let step = 0;

    bgmInterval = setInterval(() => {
        if (!audioCtx || audioCtx.state === 'suspended' || isPaused) return; 

        let osc = audioCtx.createOscillator();
        let gainNode = audioCtx.createGain();
        
        osc.type = 'triangle'; 
        // Modificar ligeramente el tono base según el nivel actual
        let freqModifier = 1 + (currentLevel - 1) * 0.15;
        osc.frequency.setValueAtTime(notes[step % notes.length] * freqModifier, audioCtx.currentTime);
        
        gainNode.gain.setValueAtTime(0.04, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc.start();
        osc.stop(audioCtx.currentTime + 0.4);
        
        step++;
    }, 300); 
}

function playSFX(type, customParam = 0) {
    if (isPaused) return; 
    if (!audioCtx) initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    let osc = audioCtx.createOscillator();
    let gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    let now = audioCtx.currentTime;

    if (type === 'jump') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(350, now + 0.12);
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.linearRampToValueAtTime(0.001, now + 0.12);
        osc.start(); osc.stop(now + 0.12);
    } 
    else if (type === 'stun') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.linearRampToValueAtTime(60, now + 0.15);
        gainNode.gain.setValueAtTime(0.15, now);
        gainNode.gain.linearRampToValueAtTime(0.001, now + 0.15);
        osc.start(); osc.stop(now + 0.15);
    } 
    else if (type === 'grab') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.08);
        gainNode.gain.setValueAtTime(0.15, now);
        gainNode.gain.linearRampToValueAtTime(0.001, now + 0.08);
        osc.start(); osc.stop(now + 0.08);
    } 
    else if (type === 'throw') {
        osc.type = 'triangle';
        let baseFreq = 180 + (customParam * 3); 
        osc.frequency.setValueAtTime(baseFreq, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.2);
        gainNode.gain.setValueAtTime(0.2, now);
        gainNode.gain.linearRampToValueAtTime(0.001, now + 0.2);
        osc.start(); osc.stop(now + 0.2);
    }
    else if (type === 'shoot') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
        gainNode.gain.setValueAtTime(0.08, now);
        gainNode.gain.linearRampToValueAtTime(0.001, now + 0.1);
        osc.start(); osc.stop(now + 0.1);
    }
    else if (type === 'powerup') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.linearRampToValueAtTime(600, now + 0.3);
        gainNode.gain.setValueAtTime(0.15, now);
        gainNode.gain.linearRampToValueAtTime(0.001, now + 0.3);
        osc.start(); osc.stop(now + 0.3);
    }
}

window.addEventListener('click', () => { initAudio(); if(audioCtx.state === 'suspended') audioCtx.resume(); });

function resizeCanvas() {
    const windowWidth = window.innerWidth - 20; 
    const windowHeight = window.innerHeight - 20;
    
    const scaleX = windowWidth / VIRTUAL_WIDTH;
    const scaleY = windowHeight / VIRTUAL_HEIGHT;
    const scaleToFit = Math.min(scaleX, scaleY);
    
    canvas.style.width = (VIRTUAL_WIDTH * scaleToFit) + 'px';
    canvas.style.height = (VIRTUAL_HEIGHT * scaleToFit) + 'px';
}

window.addEventListener('resize', resizeCanvas);

// --- Variables de Juego ---
let player = { 
    x: 40, y: 300, w: 20, h: 20, 
    dx: 0, dy: 0, 
    acc: 0.45, maxSpeed: 5.0, friction: 0.82, 
    gravity: 0.40, fallMultiplier: 1.6, jumpForce: -10.5, 
    jumping: false, hp: 100, maxHp: 100,
    facing: 1, 
    
    coyoteCounter: 0, jumpBufferCounter: 0, maxCoyote: 6,
    
    carrying: null,       
    throwPower: 0,       
    powerDir: 1,          
    isChargingThrow: false,
    displayPowerTimer: 0, 
    lastThrowPower: 0,
    
    activePower: null 
};

let platforms = [];
let enemies = [];
let particles = []; 
let projectiles = []; 
let powerStations = []; 
let hazards = []; // Pinchos y obstáculos dañinos por nivel
let levelGoal = null; // Zona de meta para avanzar de nivel
let cameraX = 0;
const levelWidth = 4000;

// Configuración de Paletas por Nivel (Estilo Game Boy / Retro)
const palettes = {
    1: { bg: '#8bac0f', primary: '#306230', secondary: '#9bbc0f', dark: '#0f380f' }, // Clásico
    2: { bg: '#c4cfa1', primary: '#4e5835', secondary: '#8b966c', dark: '#1f240a' }, // Tierra / Cueva
    3: { bg: '#2e3f45', primary: '#9bbc0f', secondary: '#53717c', dark: '#0b1114' }  // Tecnológico / Final
};

function initLevel() {
    platforms = [{ x: 0, y: 400, w: 380, h: 40 }];
    enemies = [];
    particles = [];
    projectiles = [];
    hazards = [];
    
    if (player.activePower !== 'BOOTS') {
        player.gravity = 0.40;
        player.maxCoyote = 6;
    }
    if (player.activePower !== 'ARMOR') {
        player.maxHp = 100;
    }

    player.carrying = null;
    player.isChargingThrow = false;
    player.throwPower = 0;
    player.displayPowerTimer = 0;
    
    // Las 4 Estaciones de Ayuda iniciales
    powerStations = [
        { id: 'BLASTER', x: 100, y: 360, w: 36, h: 36, active: true, draw: drawBlaster },
        { id: 'GLOVES',  x: 160, y: 360, w: 36, h: 36, active: true, draw: drawGloves },
        { id: 'BOOTS',   x: 220, y: 360, w: 36, h: 36, active: true, draw: drawBoots },
        { id: 'ARMOR',   x: 280, y: 360, w: 36, h: 36, active: true, draw: drawArmor }
    ];

    if (player.activePower) {
        powerStations.forEach(s => s.active = false);
    }
    
    let currentX = 380; 
    let lastY = 400;

    // --- Generación de terreno procedural adaptativa por Nivel ---
    while (currentX < levelWidth - 300) {
        let gap = 70 + Math.random() * 80; 
        if (currentLevel === 2) gap += 15; // Huecos más anchos en nivel 2
        if (currentLevel === 3) gap += 25; // Saltos complejos en nivel 3

        let px = currentX + gap;
        let pw = 100 + Math.random() * 80; 
        if (currentLevel === 3) pw = 80 + Math.random() * 50; // Plataformas más pequeñas en nivel 3

        let py = lastY + (Math.floor(Math.random() * 3) - 1) * 50; 
        if (py < 180) py = 180;
        if (py > 400) py = 400;

        platforms.push({ x: px, y: py, w: pw, h: 40 });

        // Añadir Pinchos (Hazards) en el suelo de los huecos a partir del Nivel 2
        if (currentLevel >= 2 && Math.random() < 0.5) {
            hazards.push({ x: currentX + 10, y: 460, w: gap - 20, h: 20, damage: 25 });
        }

        // Distribución de enemigos modificada por nivel
        let spawnChance = 0.5 + (currentLevel * 0.1);
        if (Math.random() < spawnChance) {
            let ex = px + 20;
            let ey = py - 20;
            
            enemies.push({ 
                x: ex, y: ey, w: 20, h: 20, 
                dir: 1, dx: 0, dy: 0,
                state: 'WALKING', 
                stunTimer: 0,
                p1: { x: ex + 10, y: ey + 15, ox: ex + 10, oy: ey + 15 },
                p2: { x: ex + 10, y: ey + 5,  ox: ex + 10, oy: ey + 5  },
                length: 12,
                isBoss: false
            });
        }

        currentX = px + pw;
        lastY = py;
    }

    // --- Plataforma Final Estructurada ---
    let finalPlatformY = 350;
    platforms.push({ x: currentX + 50, y: finalPlatformY, w: 250, h: 130 });

    // Si es el Nivel 3, posicionamos el "Jefe Final" custodiando la meta
    if (currentLevel === 3) {
        let bx = currentX + 100;
        let by = finalPlatformY - 40;
        enemies.push({
            x: bx, y: by, w: 40, h: 40,
            dir: -1, dx: 0, dy: 0,
            state: 'WALKING',
            stunTimer: 0,
            p1: { x: bx + 20, y: by + 30, ox: bx + 20, oy: by + 30 },
            p2: { x: bx + 20, y: by + 10, ox: bx + 20, oy: by + 10 },
            length: 24,
            isBoss: true,
            hp: 3 // Requiere ser golpeado 3 veces con otros enemigos arrojados
        });
    }

    // Definición de la zona de Meta (Level Goal)
    levelGoal = {
        x: currentX + 240,
        y: finalPlatformY - 50,
        w: 30,
        h: 50
    };
}

// --- Funciones de Dibujo de Texturas (Iconos Pixelados) ---
function drawBlaster(ctx, x, y, w, h) {
    ctx.fillStyle = palettes[currentLevel].dark; 
    ctx.fillRect(x + 8, y + 12, 20, 8); 
    ctx.fillRect(x + 24, y + 8, 4, 16); 
    ctx.fillRect(x + 28, y + 14, 6, 4); 
    ctx.fillStyle = palettes[currentLevel].secondary;
    ctx.fillRect(x + 10, y + 14, 12, 4);
}

function drawGloves(ctx, x, y, w, h) {
    ctx.fillStyle = palettes[currentLevel].primary; 
    ctx.fillRect(x + 4, y + 10, 12, 16);
    ctx.fillRect(x + 6, y + 6, 8, 4); 
    ctx.fillRect(x + 20, y + 10, 12, 16);
    ctx.fillRect(x + 22, y + 6, 8, 4); 
    ctx.fillStyle = palettes[currentLevel].dark;
    ctx.fillRect(x + 6, y + 12, 2, 2); ctx.fillRect(x + 10, y + 12, 2, 2);
    ctx.fillRect(x + 22, y + 12, 2, 2); ctx.fillRect(x + 26, y + 12, 2, 2);
}

function drawBoots(ctx, x, y, w, h) {
    ctx.fillStyle = palettes[currentLevel].dark; 
    ctx.fillRect(x + 6, y + 14, 10, 14); 
    ctx.fillRect(x + 2, y + 24, 14, 4); 
    ctx.fillRect(x + 20, y + 14, 10, 14); 
    ctx.fillRect(x + 16, y + 24, 14, 4); 
    ctx.fillStyle = palettes[currentLevel].secondary;
    ctx.fillRect(x + 8, y + 16, 6, 2); ctx.fillRect(x + 8, y + 20, 6, 2);
    ctx.fillRect(x + 22, y + 16, 6, 2); ctx.fillRect(x + 22, y + 20, 6, 2);
}

function drawArmor(ctx, x, y, w, h) {
    ctx.fillStyle = '#555555'; 
    ctx.fillRect(x + 6, y + 6, 24, 20); 
    ctx.fillRect(x + 10, y + 2, 16, 4); 
    ctx.fillRect(x + 2, y + 8, 4, 12);
    ctx.fillRect(x + 30, y + 8, 4, 12);
    ctx.fillStyle = palettes[currentLevel].dark;
    ctx.fillRect(x + 10, y + 10, 16, 2); ctx.fillRect(x + 10, y + 16, 16, 2);
}

const keys = {};
window.addEventListener('keydown', e => {
    if (e.code === 'KeyP') {
        isPaused = !isPaused;
        return; 
    }

    if (isPaused) return;

    keys[e.code] = true;
    if (e.code === 'ArrowUp') player.jumpBufferCounter = 6;
    
    if (e.code === 'KeyX') {
        initAudio(); 
        
        if (!player.activePower) {
            for (let station of powerStations) {
                if (station.active && checkCollision(player, station)) {
                    player.activePower = station.id;
                    playSFX('powerup');
                    createDust(station.x + station.w/2, station.y + station.h/2, 15, 0, -2);
                    
                    if (player.activePower === 'BOOTS') {
                        player.gravity = 0.28; 
                        player.maxCoyote = 12; 
                    }
                    if (player.activePower === 'ARMOR') {
                        player.maxHp = 200; 
                        player.hp = 200;
                    }
                    
                    powerStations.forEach(s => s.active = false);
                    return;
                }
            }
        }

        if (player.activePower === 'BLASTER' && !player.carrying && !player.isChargingThrow) {
            shootBlaster();
            return;
        }

        if (!player.carrying) {
            handleActionPress();
        } else if (!player.isChargingThrow) {
            if (player.activePower === 'GLOVES') {
                player.throwPower = 100;
                throwEnemy();
            } else {
                player.isChargingThrow = true;
                player.throwPower = 0;
                player.powerDir = 1; 
            }
        }
    }
});

window.addEventListener('keyup', e => {
    if (isPaused) return;
    keys[e.code] = false;
    if (e.code === 'KeyX' && player.isChargingThrow) {
        throwEnemy();
    }
});

function checkCollision(objA, objB) {
    return objA.x < objB.x + objB.w &&
           objA.x + objA.w > objB.x &&
           objA.y < objB.y + objB.h &&
           objA.y + objA.h > objB.y; 
}

function createDust(x, y, count, speedX, speedY) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x: x, y: y,
            vx: speedX + (Math.random() - 0.5) * 2,
            vy: speedY - Math.random() * 2,
            size: 2 + Math.random() * 3,
            life: 15 + Math.random() * 10
        });
    }
}

function shootBlaster() {
    playSFX('shoot');
    projectiles.push({
        x: player.facing === 1 ? player.x + player.w + 2 : player.x - 12,
        y: player.y + player.h / 2 - 3,
        w: 10, h: 6,
        vx: player.facing * 9,
        life: 45
    });
}

function handleActionPress() {
    let standardInteractionBox = {
        x: player.facing === 1 ? player.x + player.w : player.x - 15,
        y: player.y, w: 15, h: player.h
    };

    let grabRadiusBox = {
        x: player.x - 15, y: player.y - 10,
        w: player.w + 30, h: player.h + 20
    };

    for (let e of enemies) {
        if (e.isBoss) continue; // El jefe no se puede levantar directamente
        
        if (e.state === 'STUNNED' && checkCollision(grabRadiusBox, e)) {
            player.carrying = e;
            e.state = 'CARRIED';
            playSFX('grab'); 
            return;
        } else if (e.state === 'WALKING' && checkCollision(standardInteractionBox, e)) {
            e.state = 'STUNNED';
            e.stunTimer = 180; 
            playSFX('stun'); 
            e.p2.x += player.facing * 5; e.p2.y -= 4;
            createDust(e.x + e.w/2, e.y + e.h/2, 6, player.facing * 2, -1);
            return;
        }
    }
}

function throwEnemy() {
    let e = player.carrying;
    if (!e) return;

    e.state = 'THROWN';
    player.lastThrowPower = player.throwPower;
    player.displayPowerTimer = 30; 

    playSFX('throw', player.throwPower); 

    let forceMultiplier = (player.activePower === 'GLOVES') ? 2.0 : 1.0;
    let totalForceX = player.facing * (3 + (player.throwPower / 100) * 9) * forceMultiplier;
    let totalForceY = -4 - (player.throwPower / 100) * 5; 

    let startX = player.x + player.w / 2;
    let startY = player.y - 15;

    e.p1.x = startX; e.p1.y = startY + 5;
    e.p1.ox = startX - totalForceX; e.p1.oy = startY + 5 - totalForceY;

    e.p2.x = startX; e.p2.y = startY - 5;
    e.p2.ox = startX - totalForceX - (player.facing * 2); e.p2.oy = startY - 5 - totalForceY + 1;

    player.carrying = null;
    player.isChargingThrow = false;
    player.throwPower = 0;
    createDust(startX, startY, 5, totalForceX * 0.5, -1);
}

let pauseFlashTimer = 0;
let levelTransitionTimer = 0;

function update() {
    if (!isPaused) {
        if (player.isChargingThrow) {
            player.throwPower += player.powerDir * 4.5;
            if (player.throwPower >= 100) { player.throwPower = 100; player.powerDir = -1; }
            else if (player.throwPower <= 0) { player.throwPower = 0; player.powerDir = 1; }
        }

        if (player.displayPowerTimer > 0) player.displayPowerTimer--;

        if (player.jumpBufferCounter > 0) player.jumpBufferCounter--;
        if (!player.jumping) player.coyoteCounter = player.maxCoyote;
        else if (player.coyoteCounter > 0) player.coyoteCounter--;

        // --- Movimiento Horizontal Jugador ---
        if (keys['ArrowLeft']) {
            player.dx -= player.acc; player.facing = -1;
            if (!player.jumping && Math.random() < 0.3) createDust(player.x + player.w, player.y + player.h, 1, 1, 0);
        } else if (keys['ArrowRight']) {
            player.dx += player.acc; player.facing = 1;
            if (!player.jumping && Math.random() < 0.3) createDust(player.x, player.y + player.h, 1, -1, 0);
        } else {
            player.dx *= player.friction;
            if (Math.abs(player.dx) < 0.1) player.dx = 0;
        }

        if (player.dx > player.maxSpeed) player.dx = player.maxSpeed;
        if (player.dx < -player.maxSpeed) player.dx = -player.maxSpeed;

        if (player.jumpBufferCounter > 0 && player.coyoteCounter > 0) {
            player.dy = player.jumpForce;
            player.jumping = true;
            player.coyoteCounter = 0; player.jumpBufferCounter = 0;
            playSFX('jump'); 
            createDust(player.x + player.w/2, player.y + player.h, 6, -player.dx * 0.2, -1);
        }
        if (!keys['ArrowUp'] && player.dy < 0) player.dy *= 0.6; 

        if (player.dy > 0) player.dy += player.gravity * player.fallMultiplier;
        else player.dy += player.gravity;

        // --- Colisiones Jugador ---
        player.x += player.dx;
        for (let p of platforms) {
            if (checkCollision(player, p)) {
                if (player.dx > 0) player.x = p.x - player.w;
                else if (player.dx < 0) player.x = p.x + p.w;
                clearInterval();
                player.dx = 0;
            }
        }

        player.y += player.dy;
        let pLanding = player.jumping;
        player.jumping = true; 
        for (let p of platforms) {
            if (checkCollision(player, p)) {
                if (player.dy > 0) {
                    player.y = p.y - player.h;
                    if (pLanding && player.dy > 5) createDust(player.x + player.w/2, p.y, 5, 0, -1);
                    player.dy = 0; player.jumping = false;
                } else if (player.dy < 0) {
                    player.y = p.y + p.h; player.dy = 0;
                }
            }
        }

        // --- Colisión con Peligros Estáticos (Hazards) ---
        for (let h of hazards) {
            if (checkCollision(player, h)) {
                let armorActive = (player.activePower === 'ARMOR');
                player.hp -= armorActive ? h.damage * 0.5 : h.damage;
                player.dy = -7; // Rebote involuntario por daño
                playSFX('stun');
                createDust(player.x + player.w/2, player.y + player.h/2, 8, 0, -2);
            }
        }

        // --- Comprobar llegada a la Meta ---
        if (levelGoal && checkCollision(player, levelGoal)) {
            if (currentLevel < MAX_LEVELS) {
                currentLevel++;
                levelTransitionTimer = 90; // Activa mensaje en pantalla
                initLevel();
                player.x = 40; player.y = 300; player.dx = 0; player.dy = 0;
            } else {
                // Reiniciar juego completo al terminar el ciclo de niveles
                currentLevel = 1;
                player.activePower = null;
                initLevel();
                player.x = 40; player.y = 300;
            }
        }

        // --- Actualizar Balas Bláster ---
        for (let i = projectiles.length - 1; i >= 0; i--) {
            let proj = projectiles[i];
            proj.x += proj.vx;
            proj.life--;

            let destroyed = false;
            for (let e of enemies) {
                if (e.state === 'WALKING' && checkCollision(proj, e)) {
                    if (e.isBoss) {
                        destroyed = true; // Absorbe el disparo sin morir
                        break;
                    }
                    e.state = 'THROWN'; 
                    playSFX('stun');
                    
                    let shotForceX = Math.sign(proj.vx) * 7;
                    e.p1.ox = e.p1.x - shotForceX; e.p1.oy = e.p1.y + 3;
                    e.p2.ox = e.p2.x - shotForceX; e.p2.oy = e.p2.y + 2;

                    createDust(e.x + e.w/2, e.y + e.h/2, 8, shotForceX * 0.5, -2);
                    destroyed = true;
                    break;
                }
            }

            if (destroyed || proj.life <= 0 || proj.x < 0 || proj.x > levelWidth) {
                projectiles.splice(i, 1);
            }
        }

        // --- Gestión Mecánica de Enemigos ---
        for (let i = enemies.length - 1; i >= 0; i--) {
            let e = enemies[i];

            if (e.state === 'CARRIED') {
                e.p1.x = player.x + player.w / 2; e.p1.y = player.y - 8;
                e.p2.x = e.p1.x; e.p2.y = e.p1.y - 10;
                e.p1.ox = e.p1.x; e.p1.oy = e.p1.y;
                e.p2.ox = e.p2.x; e.p2.oy = e.p2.y;
                e.x = player.x; e.y = player.y - e.h - 4;
                continue;
            }

            if (e.state === 'WALKING') {
                // Comportamiento del Boss: Estático o patrulla mínima reducida
                let moveSpeed = e.isBoss ? 0.5 : 2;
                e.x += e.dir * moveSpeed;
                let onPlatform = false;
                let futureX = e.x + (e.dir == 1 ? e.w : 0);
                
                for (let p of platforms) {
                    if (futureX >= p.x && futureX <= p.x + p.w && e.y + e.h >= p.y && e.y + e.h <= p.y + p.h) {
                        onPlatform = true;
                        break;
                    }
                }
                if (!onPlatform || e.x < 0 || e.x > levelWidth - e.w) {
                    e.x -= e.dir * moveSpeed; e.dir *= -1;
                }

                e.p1.x = e.x + e.w/2; e.p1.y = e.y + (e.h * 0.75);
                e.p2.x = e.x + e.w/2; e.p2.y = e.y + (e.h * 0.25);
                e.p1.ox = e.p1.x; e.p1.oy = e.p1.y;
                e.p2.ox = e.p2.x; e.p2.oy = e.p2.y;

                if (checkCollision(player, e)) {
                    let armorActive = (player.activePower === 'ARMOR');
                    player.hp -= armorActive ? (e.isBoss ? 1.5 : 0.6) : (e.isBoss ? 3.0 : 1.2);
                    player.dx = e.dir * (armorActive ? 2 : 4);
                    player.dy = -3;
                    playSFX('stun'); 
                    createDust(player.x + player.w/2, player.y + player.h/2, 4, player.dx, -2);
                }

            } else if (e.state === 'STUNNED' || e.state === 'THROWN') {
                if (e.state === 'STUNNED') {
                    e.stunTimer--;
                    if (e.stunTimer <= 0) {
                        e.state = 'WALKING';
                        for (let p of platforms) {
                            if (e.x + e.w > p.x && e.x < p.x + p.w && e.y + e.h >= p.y - 6 && e.y <= p.y + p.h) {
                                e.y = p.y - e.h; break;
                            }
                        }
                        continue;
                    }
                }

                // --- PROCESAMIENTO RAGDOLL VERLET ---
                let g = player.gravity;
                let p1_vx = e.p1.x - e.p1.ox; let p1_vy = e.p1.y - e.p1.oy;
                e.p1.ox = e.p1.x; e.p1.oy = e.p1.y;
                e.p1.x += p1_vx; e.p1.y += p1_vy + g;

                let p2_vx = e.p2.x - e.p2.ox; let p2_vy = e.p2.y - e.p2.oy;
                e.p2.ox = e.p2.x; e.p2.oy = e.p2.y;
                e.p2.x += p2_vx; e.p2.y += p2_vy + g;

                for (let k = 0; k < 3; k++) { 
                    let dx = e.p2.x - e.p1.x; let dy = e.p2.y - e.p1.y;
                    let dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    let diff = e.length - dist; let percent = (diff / dist) * 0.5;
                    let offsetX = dx * percent; let offsetY = dy * percent;
                    e.p1.x -= offsetX; e.p1.y -= offsetY;
                    e.p2.x += offsetX; e.p2.y += offsetY;
                }

                let checkNodeCollision = (node) => {
                    for (let p of platforms) {
                        if (node.x >= p.x && node.x <= p.x + p.w && node.y >= p.y && node.y <= p.y + p.h) {
                            let distTop = Math.abs(node.y - p.y); let distBot = Math.abs(node.y - (p.y + p.h));
                            let distLeft = Math.abs(node.x - p.x); let distRight = Math.abs(node.x - (p.x + p.w));
                            let minDist = Math.min(distTop, distBot, distLeft, distRight);
                            
                            if (minDist === distTop) { 
                                let vx = node.x - node.ox;
                                node.y = p.y; node.ox = node.x - vx * 0.05; node.oy = p.y;               
                                return 'TOP'; 
                            }
                            else if (minDist === distBot) { node.y = p.y + p.h; node.oy = p.y + p.h; }
                            else if (minDist === distLeft) { node.x = p.x; node.ox = p.x; }
                            else if (minDist === distRight) { node.x = p.x + p.w; node.ox = p.x + p.w; }
                        }
                    }
                    return null;
                };

                let hit1 = checkNodeCollision(e.p1); let hit2 = checkNodeCollision(e.p2);
                e.x = Math.min(e.p1.x, e.p2.x) - e.w / 2;
                e.y = Math.min(e.p1.y, e.p2.y) - e.h / 2;

                if (e.state === 'THROWN' && (hit1 === 'TOP' || hit2 === 'TOP')) {
                    playSFX('stun'); createDust(e.p1.x, e.p1.y, 8, 0, -2);
                    enemies.splice(i, 1); continue;
                }

                if (e.state === 'THROWN') {
                    let hitEnemy = false;
                    for (let j = enemies.length - 1; j >= 0; j--) {
                        let target = enemies[j];
                        if (target !== e && checkCollision(e, target)) {
                            if (target.isBoss) {
                                target.hp--;
                                createDust(target.x + target.w/2, target.y + target.h/2, 15, 2, -2);
                                playSFX('stun');
                                if (target.hp <= 0) {
                                    enemies.splice(j, 1); // Eliminar Jefe Final
                                }
                                enemies.splice(i, 1); // Eliminar proyectil arrojado
                                hitEnemy = true;
                                break;
                            } else if (target.state === 'WALKING' || target.state === 'STUNNED') {
                                playSFX('stun');
                                createDust(target.x + target.w/2, target.y + target.h/2, 12, (e.p1.x - e.p1.ox) * 0.5, -2);
                                enemies.splice(Math.max(i, j), 1); enemies.splice(Math.min(i, j), 1);
                                if (i <= j) i--; 
                                hitEnemy = true; break;
                            }
                        }
                    }
                    if (hitEnemy) continue;
                }

                if (e.y > 480) enemies.splice(i, 1);
            }
        }

        // --- Actualizar Partículas ---
        for (let i = particles.length - 1; i >= 0; i--) {
            let pt = particles[i];
            pt.x += pt.vx; pt.y += pt.vy; pt.life--;
            if (pt.life <= 0) particles.splice(i, 1);
        }

        // --- Sistema de Cámara ---
        let targetCameraX = -(player.x - canvas.width * 0.35);
        if (targetCameraX > 0) targetCameraX = 0;
        if (targetCameraX < -(levelWidth - canvas.width)) targetCameraX = -(levelWidth - canvas.width);
        cameraX = targetCameraX;

        let leftViewBoundary = -cameraX;
        if (player.x < leftViewBoundary) {
            player.x = leftViewBoundary;
            if(player.dx < 0) player.dx = 0;
        }

        if (player.y > 480 || player.hp <= 0) {
            let currentPower = player.activePower;
            initLevel();
            player.activePower = currentPower;
            player.x = 40; player.y = 300; player.dx = 0; player.dy = 0;
            player.jumping = false; player.hp = player.maxHp;
            cameraX = 0;
        }
        
        if (levelTransitionTimer > 0) levelTransitionTimer--;
    } else {
        pauseFlashTimer++;
    }

    draw();
    requestAnimationFrame(update);
}

function draw() {
    let style = palettes[currentLevel];
    
    // Color de Fondo Estilizado por nivel
    ctx.fillStyle = style.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.translate(cameraX, 0);

    // Renderizado de las Estaciones
    powerStations.forEach(s => {
        if (s.active) s.draw(ctx, s.x, s.y, s.w, s.h);
    });

    // Plataformas
    ctx.fillStyle = style.dark;
    platforms.forEach(p => ctx.fillRect(p.x, p.y, p.w, p.h));

    // Peligros / Pinchos Estáticos
    ctx.fillStyle = '#9b400f';
    hazards.forEach(h => {
        ctx.fillRect(h.x, h.y, h.w, h.h);
        // Pequeños dientes de sierra pixelados
        ctx.fillStyle = style.dark;
        for (let sx = h.x; sx < h.x + h.w; sx += 8) {
            ctx.beginPath();
            ctx.moveTo(sx, h.y);
            ctx.lineTo(sx + 4, h.y - 6);
            ctx.lineTo(sx + 8, h.y);
            ctx.fill();
        }
        ctx.fillStyle = '#9b400f';
    });

    // Dibujar Meta (Bandera o zona de paso)
    if (levelGoal) {
        ctx.fillStyle = style.dark;
        ctx.fillRect(levelGoal.x, levelGoal.y, 4, levelGoal.h); // Mástil
        ctx.fillStyle = '#9bbc0f';
        ctx.fillRect(levelGoal.x + 4, levelGoal.y, 20, 14); // Bandera
    }
    
    // Enemigos y Jefes
    enemies.forEach(e => {
        if (e.state === 'WALKING') {
            ctx.fillStyle = e.isBoss ? '#0f380f' : '#9b400f'; 
            ctx.fillRect(e.x, e.y, e.w, e.h);
            
            // Corona o rasgo distintivo si es Boss
            if (e.isBoss) {
                ctx.fillStyle = '#9bbc0f';
                ctx.fillRect(e.x + 10, e.y - 6, 20, 6);
            }
        } else {
            if (e.state === 'STUNNED' || e.state === 'CARRIED') ctx.fillStyle = '#555555';
            else if (e.state === 'THROWN') ctx.fillStyle = style.dark;

            let angle = Math.atan2(e.p2.y - e.p1.y, e.p2.x - e.p1.x) + Math.PI / 2;
            ctx.save();
            ctx.translate(e.p1.x, e.p1.y);
            ctx.rotate(angle);
            ctx.fillRect(-e.w/2, -5, e.w, 10);
            ctx.fillRect(-e.w/4, -15, e.w/2, 10);
            ctx.restore();
        }
    });

    // Balas del Bláster
    ctx.fillStyle = style.dark;
    projectiles.forEach(proj => ctx.fillRect(proj.x, proj.y, proj.w, proj.h));

    // Partículas
    ctx.fillStyle = style.primary;
    particles.forEach(pt => ctx.fillRect(pt.x, pt.y, pt.size, pt.size));

    // Jugador
    ctx.fillStyle = style.primary;
    ctx.fillRect(player.x, player.y, player.w, player.h);

    // UI Dinámica de Carga de Lanzamiento
    if (player.isChargingThrow) {
        ctx.fillStyle = style.dark;
        ctx.fillRect(player.x - 5, player.y - 25, 30, 6);
        ctx.fillStyle = style.secondary;
        ctx.fillRect(player.x - 5, player.y - 25, (player.throwPower / 100) * 30, 6);
    } else if (player.displayPowerTimer > 0) {
        ctx.fillStyle = style.dark;
        ctx.fillRect(player.x - 5, player.y - 25, 30, 6);
        ctx.fillStyle = style.secondary; 
        ctx.fillRect(player.x - 5, player.y - 25, (player.lastThrowPower / 100) * 30, 6);
    }

    ctx.restore();

    // UI Fija (Barra de Vida en Pantalla)
    ctx.fillStyle = style.dark;
    ctx.fillRect(15, 15, player.maxHp, 12);
    ctx.fillStyle = style.secondary;
    ctx.fillRect(15, 15, player.hp, 12);

    // Indicador de nivel superior izquierdo
    ctx.fillStyle = style.dark;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`LVL ${currentLevel}`, 15, 45);

    // Texto de transición de Nivel
    if (levelTransitionTimer > 0) {
        ctx.fillStyle = style.dark;
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`ENTRANDO AL NIVEL ${currentLevel}`, canvas.width / 2, canvas.height / 3);
    }

    // Texto de Pausa
    if (isPaused) {
        if (Math.floor(pauseFlashTimer / 30) % 2 === 0) {
            ctx.fillStyle = style.dark;
            ctx.font = 'bold 24px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('PAUSA', canvas.width / 2, canvas.height / 2);
        }
    }
}

// Inicialización final
resizeCanvas();
initLevel();
requestAnimationFrame(update);
