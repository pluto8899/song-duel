// --- FIREBASE SETTINGS ---
const firebaseConfig = {
    apiKey: "AIzaSyCZG38tfGB0c0mDtp46kPFCAdaBQS9o2Ro",
    authDomain: "song-duel-e154b.firebaseapp.com",
    projectId: "song-duel-e154b",
    storageBucket: "song-duel-e154b.firebasestorage.app",
    messagingSenderId: "857960266089",
    appId: "1:857960266089:web:cef7802c0036873c9465f8",
    measurementId: "G-506J480366"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
let currentUser = null;

// --- GAME VARIABLES ---
const LFM_KEY = '1baa559094f94c0383f393bae1aee761';
let currentMode = 'global'; // 'global' or 'artist'
let songA, songB;
let currentAudio = null;
let activeCard = null; 

let score = 0;
let lives = 3;
let highScore = localStorage.getItem('mysteryDuelBest') || 0;
let currentName = "Anonymous";

// --- AUTHENTICATION LOGIC ---
auth.onAuthStateChanged(user => {
    currentUser = user;
    const authBtn = document.getElementById('auth-btn');
    const welcomeMsg = document.getElementById('user-welcome');

    if (user) {
        authBtn.innerText = "SIGN OUT";
        
        db.collection('users').doc(user.uid).get().then(doc => {
            if (doc.exists && doc.data().name) {
                highScore = Math.max(highScore, doc.data().highScore || 0);
                currentName = doc.data().name;
                localStorage.setItem('mysteryDuelBest', highScore);
                
                welcomeMsg.innerText = `Welcome, ${currentName}!`;
                welcomeMsg.classList.remove('hidden');
                updateStatusDisplay();
            } else {
                document.getElementById('username-modal').classList.remove('hidden');
            }
        });
    } else {
        authBtn.innerText = "SIGN IN WITH GOOGLE";
        welcomeMsg.classList.add('hidden');
        highScore = localStorage.getItem('mysteryDuelBest') || 0;
        currentName = "Anonymous";
        updateStatusDisplay();
    }
});

function toggleAuth() {
    if (currentUser) {
        auth.signOut();
    } else {
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(error => { console.error("Login Failed:", error.message); });
    }
}

// --- UNIQUE USERNAME LOGIC ---
async function claimUsername() {
    const inputVal = document.getElementById('new-username-input').value.trim();
    const errorMsg = document.getElementById('username-error');

    if (!inputVal) { errorMsg.innerText = "Name cannot be empty!"; return; }
    if (inputVal.length < 3) { errorMsg.innerText = "Name must be at least 3 characters!"; return; }

    const lowerName = inputVal.toLowerCase();
    errorMsg.innerText = "Checking availability...";

    try {
        const snapshot = await db.collection('users').where('name_lower', '==', lowerName).get();
        if (!snapshot.empty) {
            errorMsg.innerText = "That name is already taken!";
            return;
        }

        currentName = inputVal;
        await db.collection('users').doc(currentUser.uid).set({
            name: currentName, name_lower: lowerName, highScore: highScore
        }, { merge: true });

        document.getElementById('username-modal').classList.add('hidden');
        const welcomeMsg = document.getElementById('user-welcome');
        welcomeMsg.innerText = `Welcome, ${currentName}!`;
        welcomeMsg.classList.remove('hidden');
    } catch (error) {
        console.error("Error claiming name:", error);
        errorMsg.innerText = "Network error. Try again.";
    }
}

// --- GAME UI LOGIC ---
function startGame(mode) {
    currentMode = mode;
    score = 0; 
    lives = 3;
    document.getElementById('modal-overlay').classList.add('hidden');
    document.getElementById('new-best-msg').classList.add('hidden');
    
    document.getElementById('mode-display').innerText = mode === 'global' ? "GLOBAL" : "ARTIST";
    
    updateStatusDisplay();
    showScreen('game-screen');
    setupRound();
}

function showHome() {
    stopAllAudio();
    // Hide any popups that might be open
    document.getElementById('modal-overlay').classList.add('hidden');
    document.getElementById('confirm-modal').classList.add('hidden');
    // Switch to home
    showScreen('home-screen');
}


// Button Listeners for the Modal
document.getElementById('confirm-yes').onclick = function() {
    document.getElementById('confirm-modal').classList.add('hidden');
    if (pendingAction === 'home') {
        stopAllAudio();
        showHome();
    } else {
        startGame(currentMode);
    }
};

document.getElementById('confirm-no').onclick = function() {
    document.getElementById('confirm-modal').classList.add('hidden');
};

// Replace your old functions with these simple triggers
function confirmHome() { showCustomConfirm('home'); }
function confirmRestart() { showCustomConfirm('restart'); }

async function showLeaderboard() {
    document.getElementById('lb-best').innerText = highScore;
    const lbList = document.getElementById('leaderboard-list');
    lbList.innerHTML = "<p>Loading global scores...</p>";
    showScreen('leaderboard-screen');

    try {
        const snapshot = await db.collection('users').orderBy('highScore', 'desc').limit(10).get();
        lbList.innerHTML = "";
        let rank = 1;
        if (snapshot.empty) {
            lbList.innerHTML = "<p style='text-align:center; color:#888;'>No scores yet. Be the first!</p>";
            return;
        }
        snapshot.forEach(doc => {
            const data = doc.data();
            const entry = document.createElement('div');
            entry.className = 'lb-entry';
            const playerName = data.name || 'Anonymous';
            entry.innerHTML = `<span class="lb-rank">#${rank}</span> <span class="lb-name">${playerName}</span> <span class="lb-score">${data.highScore}</span>`;
            lbList.appendChild(entry);
            rank++;
        });
    } catch (error) {
        console.error("Error fetching leaderboard:", error);
        lbList.innerHTML = "<p style='text-align:center; color:#ff4444;'>Error loading scores. Please check your connection.</p>";
    }
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

function updateStatusDisplay() {
    document.getElementById('current-score').innerText = score;
    document.getElementById('best-score').innerText = highScore;
    document.getElementById('lives-display').innerText = "❤️".repeat(lives) || "💀";
}

async function fetchSongData(artist, track) {
    try {
        const lfmUrl = `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&api_key=${LFM_KEY}&artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(track)}&format=json`;
        const lfmRes = await fetch(lfmUrl);
        const lfmData = await lfmRes.json();
        const plays = parseInt(lfmData.track?.playcount || 0);

        const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(artist + " " + track)}&entity=song&limit=1`;
        const itunesRes = await fetch(itunesUrl);
        const itunesData = await itunesRes.json();
        const info = itunesData.results[0];

        if (!info) return null;
        return {
            name: track, artist: artist, plays: plays,
            preview: info.previewUrl,
            link: info.trackViewUrl,
            image: info.artworkUrl100.replace('100x100bb', '400x400bb')
        };
    } catch (e) { return null; }
}

async function setupRound() {
    stopAllAudio();
    document.getElementById('status-msg').innerText = "FINDING TRACKS...";
    document.getElementById('next-btn').classList.add('hidden');
    
    // Reset UI for the new round
    document.getElementById('betting-buttons').classList.remove('hidden');
    document.getElementById('plays-b').classList.add('hidden');
    document.getElementById('plays-b-label').classList.add('hidden');
    
    // Hide Apple Music links and Blur Card B again
    document.querySelectorAll('.promo-link').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.pixelated, .text-hidden').forEach(el => el.classList.remove('reveal'));
    
    let sA = null, sB = null;

    if (currentMode === 'global') {
        while (!sA || !sB) {
            let idx1 = Math.floor(Math.random() * flatSongPool.length);
            let idx2;
            do { idx2 = Math.floor(Math.random() * flatSongPool.length); } while (idx1 === idx2);
            sA = await fetchSongData(flatSongPool[idx1].artist, flatSongPool[idx1].track);
            sB = await fetchSongData(flatSongPool[idx2].artist, flatSongPool[idx2].track);
        }
    } else {
        while (!sA || !sB) {
            const artists = Object.keys(songDatabase);
            const randomArtist = artists[Math.floor(Math.random() * artists.length)];
            const tracks = songDatabase[randomArtist];
            
            let idx1 = Math.floor(Math.random() * tracks.length);
            let idx2;
            do { idx2 = Math.floor(Math.random() * tracks.length); } while (idx1 === idx2);
            
            sA = await fetchSongData(randomArtist, tracks[idx1]);
            sB = await fetchSongData(randomArtist, tracks[idx2]);
        }
    }

    songA = sA; songB = sB;
    
    document.getElementById('name-a').innerText = songA.name;
    document.getElementById('artist-a').innerText = songA.artist;
    document.getElementById('img-a').src = songA.image;
    document.getElementById('plays-a').innerText = Number(songA.plays).toLocaleString();
    document.getElementById('link-a').href = songA.link;
    
    document.getElementById('name-b').innerText = songB.name;
    document.getElementById('artist-b').innerText = songB.artist;
    document.getElementById('img-b').src = songB.image;
    document.getElementById('plays-b').innerText = Number(songB.plays).toLocaleString();
    document.getElementById('link-b').href = songB.link;

    document.getElementById('status-msg').innerText = `Does the mystery track have HIGHER or LOWER plays?`;
}

function checkWinner(guess) {
    if (lives <= 0 || document.getElementById('betting-buttons').classList.contains('hidden')) return;
    stopAllAudio();

    // Reveal Card B's stats, image, text, and promo links
    document.getElementById('betting-buttons').classList.add('hidden');
    document.getElementById('plays-b').classList.remove('hidden');
    document.getElementById('plays-b-label').classList.remove('hidden');
    document.querySelectorAll('.pixelated, .text-hidden').forEach(el => el.classList.add('reveal'));
    document.querySelectorAll('.promo-link').forEach(el => el.classList.remove('hidden'));

    // Check if the user guessed correctly
    let isCorrect = false;
    if (guess === 'higher' && songB.plays >= songA.plays) isCorrect = true;
    if (guess === 'lower' && songB.plays <= songA.plays) isCorrect = true;

    if (isCorrect) {
        score++;
        document.body.classList.add('flash-correct');
        setTimeout(() => document.body.classList.remove('flash-correct'), 500);
        document.getElementById('status-msg').innerText = "CORRECT!";
        
        if (score > highScore) {
            highScore = score;
            localStorage.setItem('mysteryDuelBest', highScore);
            
            if (currentUser && currentName !== "Anonymous") {
                db.collection('users').doc(currentUser.uid).set({
                    name: currentName, name_lower: currentName.toLowerCase(), highScore: highScore
                }, { merge: true });
            }
        }
    } else {
        lives--;
        document.body.classList.add('flash-wrong');
        setTimeout(() => document.body.classList.remove('flash-wrong'), 500);
        document.getElementById('status-msg').innerText = "WRONG!";
    }

    updateStatusDisplay();
    if (lives > 0) {
        document.getElementById('next-btn').classList.remove('hidden');
    } else {
        document.getElementById('final-score-display').innerText = score;
        if (score >= highScore && score > 0) document.getElementById('new-best-msg').classList.remove('hidden');
        document.getElementById('modal-overlay').classList.remove('hidden');
    }
}

function toggleAudio(id, event) {
    event.stopPropagation();
    const song = (id === 'A') ? songA : songB;
    const btn = document.getElementById(`btn-audio-${id}`);

    if (currentAudio && activeCard === id) {
        if (currentAudio.paused) {
            currentAudio.play();
            btn.innerText = "⏸ PAUSE";
        } else {
            currentAudio.pause();
            btn.innerText = "▶ PLAY";
        }
    } else {
        stopAllAudio();
        currentAudio = new Audio(song.preview);
        activeCard = id;
        currentAudio.play();
        btn.innerText = "⏸ PAUSE";
        currentAudio.onended = () => { btn.innerText = "▶ PLAY"; activeCard = null; };
    }
}

function stopAllAudio() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
    activeCard = null;
    document.getElementById('btn-audio-a').innerText = "▶ PLAY";
    document.getElementById('btn-audio-b').innerText = "▶ PLAY";
}

function shareScore() {
    const text = `I survived ${score} rounds in Stream Stakes (${currentMode.toUpperCase()} mode)! Can you beat my high score? 🎶`;
    navigator.clipboard.writeText(text).then(() => alert("Score copied to clipboard!"));
}

// UNIVERSAL CONFIRMATION LOGIC
let pendingAction = null;

function showCustomConfirm(type) {
    if (score === 0) {
        if (type === 'home') { stopAllAudio(); showHome(); }
        else { startGame(currentMode); }
        return;
    }
    pendingAction = type;
    const modal = document.getElementById('confirm-modal');
    const title = document.getElementById('confirm-title');
    
    title.innerText = (type === 'home') ? "EXIT TO MENU?" : "RESTART GAME?";
    modal.classList.remove('hidden');
}

// This connects the "YES" button inside the popup
document.getElementById('confirm-yes').onclick = function() {
    // 1. Hide the popup immediately
    document.getElementById('confirm-modal').classList.add('hidden');
    
    if (pendingAction === 'home') {
        // 2. Stop the music
        stopAllAudio();
        // 3. Force the screen to switch to Home
        showScreen('home-screen'); 
    } else {
        // 2. Just restart the current mode
        startGame(currentMode);
    }
};

document.getElementById('confirm-no').onclick = function() {
    document.getElementById('confirm-modal').classList.add('hidden');
};

// These replace your old button functions
function confirmHome() { showCustomConfirm('home'); }
function confirmRestart() { showCustomConfirm('restart'); }