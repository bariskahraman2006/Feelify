// public/js/app.js - PLAYLIST LINK FIX

document.addEventListener('DOMContentLoaded', async () => {
    
    // 1. KULLANICI BİLGİLERİNİ YÜKLE
    await loadUserProfile();

    // 2. PLAYLISTLERİ YÜKLE
    if (document.getElementById('saved-playlists')) {
        await loadSavedPlaylists();
    }
    
    // 3. STATS SAYFASI KONTROLÜ
    if (document.getElementById('stats-content')) {
        await loadStats();
    }

    // 4. YAPAY ZEKA MODELLERİNİ YÜKLE
    await loadAIModels();

    // 5. BUTONLAR
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
});

// --- YENİ: AI MODELLERİNİ YÜKLEME ---
async function loadAIModels() {
    console.log("AI Modelleri yükleniyor...");
    const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
    try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
        console.log("✅ AI Modelleri Hazır!");
    } catch (e) {
        console.error("AI Modelleri Yüklenemedi:", e);
    }
}

// --- API & SAYFA FONKSİYONLARI ---
async function loadUserProfile() {
    try {
        const res = await fetch('/api/me');
        const data = await res.json();
        
        const nameEls = document.querySelectorAll('#user-name');
        nameEls.forEach(el => el.innerText = data.username || 'User');
        
        if (data.image) {
            const avatarEls = document.querySelectorAll('#user-avatar');
            avatarEls.forEach(img => {
                img.src = data.image;
                img.style.display = 'block';
            });
            document.querySelectorAll('#user-avatar-placeholder').forEach(el => el.style.display = 'none');
        }
    } catch(e) { console.log("Profil hatası:", e); }
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
                
                // --- İŞTE DÜZELTİLEN SATIR BURASI ---
                // ID varsa standart Spotify linkini oluştur, yoksa boş link (#) koy.
                const spotifyLink = pl.spotifyPlaylistId 
                    ? `https://open.spotify.com/playlist/${pl.spotifyPlaylistId}` 
                    : '#';
                
                const targetAttr = pl.spotifyPlaylistId ? 'target="_blank"' : '';
                
                li.innerHTML = `
                    <a href="${spotifyLink}" ${targetAttr} style="display:flex; align-items:center; text-decoration:none; color:#b3b3b3; margin-bottom:10px; transition:0.2s;">
                        <div class="playlist-thumbnail" style="width:40px; height:40px; background:#333; margin-right:10px; border-radius:5px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                            <i class="fas fa-music" style="color: #1ed760;"></i>
                        </div>
                        <span style="font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width: 180px;">
                            ${pl.playlistName.replace('Feelify: ', '')}
                        </span>
                    </a>`;
                
                // Hover efekti
                const linkEl = li.querySelector('a');
                linkEl.onmouseover = function() { this.style.color = 'white'; this.style.transform = 'translateX(5px)'; };
                linkEl.onmouseout = function() { this.style.color = '#b3b3b3'; this.style.transform = 'translateX(0)'; };
                
                list.appendChild(li);
            });
        });

    } catch(e) { console.error("Playlist hatası:", e); }
}

async function loadStats() {
    const loadingEl = document.getElementById('loading-stats');
    const contentEl = document.getElementById('stats-content');

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
                const html = `
                    <a href="${t.external_urls.spotify}" target="_blank" class="list-item">
                        <div class="rank">${i + 1}</div>
                        <img src="${img}" class="item-img" alt="art">
                        <div class="info">
                            <span class="title">${t.name}</span>
                            <span class="artist">${t.artists[0].name}</span>
                        </div>
                    </a>`;
                tracksList.innerHTML += html;
            });
        }

        if (artistsList) {
            artistsList.innerHTML = '';
            data.artists.forEach((a, i) => {
                const img = a.images[0]?.url || '';
                const html = `
                    <a href="${a.external_urls.spotify}" target="_blank" class="list-item">
                        <div class="rank">${i + 1}</div>
                        <img src="${img}" class="item-img" style="border-radius:50%;" alt="artist">
                        <div class="info">
                            <span class="title">${a.name}</span>
                        </div>
                    </a>`;
                artistsList.innerHTML += html;
            });
        }

        if(loadingEl) loadingEl.style.display = 'none';
        if(contentEl) contentEl.style.display = 'flex';

    } catch(e) { console.log("Stats hatası:", e); }
}

async function generateMelody() {
    const input = document.getElementById('mood-prompt');
    const resultDiv = document.getElementById('playlist-results');
    const btn = document.getElementById('generate-button');
    
    if (input.value.length < 3) {
        alert("Lütfen bir şeyler yazın!");
        return;
    }

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
            loadSavedPlaylists(); // Yeni playlisti listeye hemen ekle
        } else {
            resultDiv.innerHTML = `<p style="color:red">Error: ${data.error}</p>`;
        }
    } catch (e) {
        resultDiv.innerHTML = `<p style="color:red">Bağlantı hatası.</p>`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'GENERATE MY MELODY';
    }
}

// --- KAMERA (FACE-API İLE) ---
let stream;
async function initCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: {} });
        const video = document.getElementById('video-feed');
        video.srcObject = stream;
    } catch(e) { alert("Kamera izni verilmedi."); }
}

function stopCamera() {
    if (stream) stream.getTracks().forEach(t => t.stop());
}

async function captureMoodWithAI() {
    const video = document.getElementById('video-feed');
    const input = document.getElementById('mood-prompt');
    const container = document.getElementById('camera-feed-container');

    const overlay = document.createElement('div');
    overlay.innerHTML = `<div style="position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); color:#1ed760; display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:999;"><i class="fas fa-brain fa-3x fa-spin"></i><h3>AI ANALYZING...</h3><p>Detecting micro-expressions</p></div>`;
    container.appendChild(overlay);

    // face-api.js ile yüz analizi
    const detections = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions()).withFaceExpressions();

    setTimeout(() => {
        if (detections) {
            const expressions = detections.expressions;
            let maxEmotion = 'neutral';
            let maxValue = 0;
            
            for (const [emotion, value] of Object.entries(expressions)) {
                if (value > maxValue) {
                    maxValue = value;
                    maxEmotion = emotion;
                }
            }

            let aiText = "";
            if (maxEmotion === 'happy') aiText = "Detected: Genuine Happiness. Suggesting: Upbeat & Pop Hits.";
            else if (maxEmotion === 'sad') aiText = "Detected: Sadness. Suggesting: Acoustic & Melancholic Songs.";
            else if (maxEmotion === 'angry') aiText = "Detected: Frustration. Suggesting: Heavy Metal & Rock.";
            else if (maxEmotion === 'surprised') aiText = "Detected: Surprise! Suggesting: Experimental & Funky Beats.";
            else if (maxEmotion === 'neutral') aiText = "Detected: Calm/Neutral. Suggesting: Chill & Focus Music.";
            else aiText = `Detected: ${maxEmotion} mood. Suggesting balanced mix.`;

            input.value = aiText + " (AI Confidence: " + Math.round(maxValue * 100) + "%)";
        
        } else {
            input.value = "AI could not detect a face. Please ensure good lighting.";
        }

        stopCamera();
        overlay.remove();
        container.style.display = 'none';
        document.getElementById('prompt-input-wrapper').style.display = 'flex';

    }, 1500); 
}