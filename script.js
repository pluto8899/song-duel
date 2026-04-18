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
let songA, songB;
let currentAudio = null;
let activeCard = null; 

let score = 0;
let lives = 3;
let highScore = localStorage.getItem('mysteryDuelBest') || 0;

// --- AUTHENTICATION LOGIC ---
auth.onAuthStateChanged(user => {
    currentUser = user;
    const authBtn = document.getElementById('auth-btn');
    const welcomeMsg = document.getElementById('user-welcome');

    if (user) {
        authBtn.innerText = "SIGN OUT";
        welcomeMsg.innerText = `Welcome, ${user.displayName.split(' ')[0]}!`;
        welcomeMsg.classList.remove('hidden');

        db.collection('users').doc(user.uid).get().then(doc => {
            if (doc.exists) {
                highScore = Math.max(highScore, doc.data().highScore);
                localStorage.setItem('mysteryDuelBest', highScore);
                updateStatusDisplay();
            }
        });
    } else {
        authBtn.innerText = "SIGN IN WITH GOOGLE";
        welcomeMsg.classList.add('hidden');
        highScore = localStorage.getItem('mysteryDuelBest') || 0;
        updateStatusDisplay();
    }
});

function toggleAuth() {
    if (currentUser) {
        auth.signOut();
    } else {
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(error => {
            console.error("Login Failed:", error.message);
        });
    }
}

// --- GAME UI LOGIC ---
function startGame() {
    score = 0; lives = 3;
    document.getElementById('modal-overlay').classList.add('hidden');
    document.getElementById('new-best-msg').classList.add('hidden');
    updateStatusDisplay();
    showScreen('game-screen');
    setupRound();
}

function showHome() {
    document.getElementById('modal-overlay').classList.add('hidden');
    showScreen('home-screen');
}

function showLeaderboard() {
    document.getElementById('lb-best').innerText = highScore;
    showScreen('leaderboard-screen');
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

async function fetchSongData(songObj) {
    try {
        const lfmUrl = `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&api_key=${LFM_KEY}&artist=${encodeURIComponent(songObj.artist)}&track=${encodeURIComponent(songObj.track)}&format=json`;
        const lfmRes = await fetch(lfmUrl);
        const lfmData = await lfmRes.json();
        const plays = parseInt(lfmData.track?.playcount || 0);

        const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(songObj.artist + " " + songObj.track)}&entity=song&limit=1`;
        const itunesRes = await fetch(itunesUrl);
        const itunesData = await itunesRes.json();
        const info = itunesData.results[0];

        if (!info) return null;
        return {
            name: songObj.track, artist: songObj.artist, plays: plays,
            preview: info.previewUrl, link: info.trackViewUrl,
            image: info.artworkUrl100.replace('100x100bb', '400x400bb')
        };
    } catch (e) { return null; }
}

async function setupRound() {
    stopAllAudio();
    document.getElementById('status-msg').innerText = "MATCHING DUELISTS...";
    document.getElementById('next-btn').classList.add('hidden');
    document.querySelectorAll('.count, .promo-link').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.reveal').forEach(el => el.classList.remove('reveal'));

    let sA = null, sB = null;
    while (!sA || !sB) {
        let idx1 = Math.floor(Math.random() * songPool.length);
        let idx2;
        do { idx2 = Math.floor(Math.random() * songPool.length); } while (idx1 === idx2);
        sA = await fetchSongData(songPool[idx1]);
        sB = await fetchSongData(songPool[idx2]);
    }
    songA = sA; songB = sB;
    updateUI('a', songA); updateUI('b', songB);
    document.getElementById('status-msg').innerText = "WHO HAD MORE PLAYS?";
}

function updateUI(id, song) {
    document.getElementById(`name-${id}`).innerText = song.name;
    document.getElementById(`artist-${id}`).innerText = song.artist;
    document.getElementById(`img-${id}`).src = song.image;
    document.getElementById(`plays-${id}`).innerText = Number(song.plays).toLocaleString() + " plays";
    document.getElementById(`link-${id}`).href = song.link;
    document.getElementById(`btn-audio-${id}`).innerText = "▶ PLAY";
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

function checkWinner(choice) {
    if (!document.getElementById('plays-a').classList.contains('hidden') || lives <= 0) return;
    stopAllAudio();

    document.querySelectorAll('.pixelated, .text-hidden').forEach(el => el.classList.add('reveal'));
    document.querySelectorAll('.count, .promo-link').forEach(el => el.classList.remove('hidden'));

    const correct = (choice === 'A' && songA.plays > songB.plays) || (choice === 'B' && songB.plays > songA.plays);

    if (correct) {
        score++;
        document.body.classList.add('flash-correct');
        setTimeout(() => document.body.classList.remove('flash-correct'), 500);
        document.getElementById('status-msg').innerText = "CORRECT!";
        
        if (score > highScore) {
            highScore = score;
            localStorage.setItem('mysteryDuelBest', highScore);
            
            // SAVE TO CLOUD IF LOGGED IN
            if (currentUser) {
                db.collection('users').doc(currentUser.uid).set({
                    name: currentUser.displayName,
                    highScore: highScore
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

function shareScore() {
    const text = `I survived ${score} duels in Song Duel! Can you beat my high score? 🎶`;
    navigator.clipboard.writeText(text).then(() => alert("Score copied to clipboard!"));
}