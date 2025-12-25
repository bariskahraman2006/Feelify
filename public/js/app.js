// public/js/app.js - ERROR FREE VERSION

document.addEventListener('DOMContentLoaded', async () => {
    
    // 1. ÖNCE BUTONLARI TANIMLA (Böylece AI yüklenmese bile butonlar çalışır)
    const generateBtn = document.getElementById('generate-button');
    const cameraBtn = document.getElementById('camera-button');
    const goBackBtn = document.getElementById('go-back-button');
    const captureBtn = document.getElementById('capture-mood-button');

    if (generateBtn) generateBtn.addEventListener('click', generateMelody);
    
    if (cameraBtn) {
        cameraBtn.addEventListener('click', () => {
            initCamera();
            document.getElementById('prompt-input-wrapper').style.display = 'none';
            document.getElementById('camera-feed-container').style.display = 'flex';
        });
    }

    if (goBackBtn) {
        goBackBtn.addEventListener('click', () => {
            stopCamera();
            document.getElementById('camera-feed-container').style.display = 'none';
            document.getElementById('prompt-input-wrapper').style.display = 'flex';
        });
    }
    
    if (captureBtn) captureBtn.addEventListener('click', captureMoodWithAI);

    // 2. VERİLERİ YÜKLE
    await loadUserProfile();
    if (document.getElementById('saved-playlists')) await loadSavedPlaylists();
    if (document.getElementById('stats-content')) await loadStats();

    // 3. EN SON AI MODELLERİNİ YÜKLE (Sayfayı kilitlemesin)
    loadAIModels(); 
});

// --- YENİ: AI MODELLERİNİ YÜKLEME ---
async function loadAIModels() {
    console.log("AI Modelleri arka planda yükleniyor...");
    // Eğer faceapi tanımlı değilse (internet yoksa veya script yüklenmediyse) patlamasın
    if (typeof faceapi === 'undefined') {
        console.error("UYARI: face-api.js kütüphanesi bulunamadı. Index.html dosyanı kontrol et.");
        return;
    }

    const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
    try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
        console.log("✅ AI Modelleri Hazır!");
    } catch (e) {
        console.error("AI Modelleri Yüklenemedi (İnternet bağlantını kontrol et):", e);
    }
}

// --- API & SAYFA FONKSİYONLARI ---
async function loadUserProfile() {
    try {
        const res = await fetch('/api/me');
        const data = await res.json();
        document.querySelectorAll('#user-name').forEach(el => el.innerText = data.username || 'User');
        if (data.image) {
            document.querySelectorAll('#user-avatar').forEach(img => {
                img.src = data.image; img.style.display = 'block';
            });
            document.querySelectorAll('#user-avatar-placeholder').forEach(el => el.style.display = 'none');
        }
    } catch(e) { console.log(e); }
}

async function loadSavedPlaylists() {
    const lists = document.querySelectorAll('#saved-playlists'); 
    try {
        const res = await fetch('/api/my-playlists');
        const data = await res.json();

        lists.forEach(list => {
            list.innerHTML = '';
            if (!data || data.length === 0) {
                list.innerHTML = '<li style="padding:10px; color:#777; font-size:12px;">No playlists yet.</li>';
                return;
            }

            data.forEach(pl => {
                const li = document.createElement('li');
                
                const spotifyLink = pl.spotifyPlaylistId 
                    ? `https://open.spotify.com/playlist/${pl.spotifyPlaylistId}` 
                    : '#';
                
                const targetAttr = pl.spotifyPlaylistId ? 'target="_blank"' : '';
                const cursorStyle = pl.spotifyPlaylistId ? 'cursor: pointer;' : 'cursor: default; opacity: 0.5;';

                li.innerHTML = `
                    <a href="${spotifyLink}" ${targetAttr} style="display:flex; align-items:center; text-decoration:none; color:#b3b3b3; margin-bottom:10px; transition:0.2s; ${cursorStyle}">
                        <div class="playlist-thumbnail" style="width:40px; height:40px; background:#333; margin-right:10px; border-radius:5px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                            <i class="fas fa-music" style="color: #1ed760;"></i>
                        </div>
                        <span style="font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width: 180px;">
                            ${pl.playlistName.replace('Feelify: ', '')}
                        </span>
                    </a>`;
                list.appendChild(li);
            });
        });
    } catch(e) { console.error(e); }
}

async function loadStats() {
    const contentEl = document.getElementById('stats-content');
    const loadingEl = document.getElementById('loading-stats');
    
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        
        if (data.error) {
             if(loadingEl) loadingEl.innerHTML = `<p style="color:red">${data.error}</p>`;
             return;
        }

        const tracksList = document.getElementById('tracks-list');
        const artistsList = document.getElementById('artists-list');

        if (tracksList) {
            tracksList.innerHTML = '';
            data.tracks.forEach((t, i) => {
                const img = t.album.images[0]?.url || '';
                tracksList.innerHTML += `
                    <a href="${t.external_urls.spotify}" target="_blank" class="list-item">
                        <div class="rank">${i + 1}</div>
                        <img src="${img}" class="item-img" alt="art">
                        <div class="info">
                            <span class="title">${t.name}</span>
                            <span class="artist">${t.artists[0].name}</span>
                        </div>
                    </a>`;
            });
        }

        if (artistsList) {
            artistsList.innerHTML = '';
            data.artists.forEach((a, i) => {
                const img = a.images[0]?.url || '';
                artistsList.innerHTML += `
                    <a href="${a.external_urls.spotify}" target="_blank" class="list-item">
                        <div class="rank">${i + 1}</div>
                        <img src="${img}" class="item-img" style="border-radius:50%;" alt="artist">
                        <div class="info">
                            <span class="title">${a.name}</span>
                        </div>
                    </a>`;
            });
        }
        if(loadingEl) loadingEl.style.display = 'none';
        if(contentEl) contentEl.style.display = 'flex';
    } catch(e) { console.log(e); }
}

async function generateMelody() {
    const input = document.getElementById('mood-prompt');
    const resultDiv = document.getElementById('playlist-results');
    const btn = document.getElementById('generate-button');
    
    if (input.value.length < 3) { alert("Please write something!"); return; }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
    resultDiv.innerHTML = '<div class="placeholder-card"><p>AI is analyzing your taste...</p></div>';

    try {
        const res = await fetch('/api/generate-melody', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ feeling_text: input.value })
        });
        const data = await res.json();

        if (data.success) {
            resultDiv.innerHTML = `
                <div class="placeholder-card" style="border-left: 5px solid #1DB954; text-align:left; padding-left:20px;">
                    <h3 style="margin-bottom:10px;">✅ Playlist Ready!</h3>
                    <p style="margin-bottom:15px;">Mood: <strong>${data.mood}</strong></p>
                    <a href="${data.playlist_url}" target="_blank" class="spotify-button" style="display:inline-block; background:#1DB954; color:black; padding:10px 20px; border-radius:50px; text-decoration:none; font-weight:bold;">
                        <i class="fab fa-spotify"></i> Open in Spotify
                    </a>
                </div>`;
            loadSavedPlaylists();
        } else { resultDiv.innerHTML = `<p style="color:red">Error: ${data.error}</p>`; }
    } catch (e) { 
        console.error(e);
        resultDiv.innerHTML = `<p style="color:red">Connection error. Check terminal logs.</p>`; 
    } 
    finally { btn.disabled = false; btn.innerHTML = 'GENERATE MY MELODY'; }
}

// --- KAMERA ---
let stream;
async function initCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: {} });
        document.getElementById('video-feed').srcObject = stream;
    } catch(e) { alert("Camera permission denied."); }
}
function stopCamera() { if (stream) stream.getTracks().forEach(t => t.stop()); }

async function captureMoodWithAI() {
    const video = document.getElementById('video-feed');
    const input = document.getElementById('mood-prompt');
    const container = document.getElementById('camera-feed-container');

    // Eğer faceapi yüklenmediyse uyar ve çık
    if (typeof faceapi === 'undefined' || !faceapi.nets.tinyFaceDetector.params) {
        alert("AI models are not loaded yet or blocked. Check your internet connection.");
        return;
    }

    const overlay = document.createElement('div');
    overlay.innerHTML = `<div style="position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); color:#1ed760; display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:999;"><i class="fas fa-brain fa-3x fa-spin"></i><h3>AI ANALYZING...</h3></div>`;
    container.appendChild(overlay);

    try {
        const detections = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions()).withFaceExpressions();

        setTimeout(() => {
            if (detections) {
                const expressions = detections.expressions;
                let maxEmotion = 'neutral';
                let maxValue = 0;
                for (const [emotion, value] of Object.entries(expressions)) {
                    if (value > maxValue) { maxValue = value; maxEmotion = emotion; }
                }
                let aiText = "";
                if (maxEmotion === 'happy') aiText = "Detected: Happiness! Suggesting Upbeat Hits.";
                else if (maxEmotion === 'sad') aiText = "Detected: Sadness. Suggesting Acoustic & Slow Songs.";
                else if (maxEmotion === 'angry') aiText = "Detected: Frustration. Suggesting Rock & Metal.";
                else aiText = `Detected: ${maxEmotion.toUpperCase()}. Suggesting balanced mix.`;
                
                input.value = aiText + ` (${Math.round(maxValue * 100)}%)`;
            } else {
                input.value = "Face not detected. Please improve lighting.";
            }
            stopCamera();
            overlay.remove();
            container.style.display = 'none';
            document.getElementById('prompt-input-wrapper').style.display = 'flex';
        }, 1000);
    } catch(e) {
        console.error("Kamera Hatası:", e);
        alert("AI Error. Check console.");
        stopCamera();
        overlay.remove();
    }
}