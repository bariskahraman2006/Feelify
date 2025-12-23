document.addEventListener('DOMContentLoaded', async () => {
    // 1. Kullanıcı Profilini Her Sayfada Yükle
    await loadUserProfile();

    // 2. Sayfaya Göre İşlem Yap (Dashboard)
    if (document.getElementById('saved-playlists')) {
        await loadSavedPlaylists();
    }
    
    // 3. Sayfaya Göre İşlem Yap (Stats Sayfası)
    // Eğer 'stats-content' ID'li kutu varsa burası Stats sayfasıdır.
    if (document.getElementById('stats-content')) {
        console.log("Stats sayfası algılandı, veriler çekiliyor...");
        await loadStats();
    }

    // 4. Buton Tanımlamaları
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
    
    if (captureBtn) captureBtn.addEventListener('click', captureMood);
});

// --- API FONKSİYONLARI ---

async function loadUserProfile() {
    try {
        const res = await fetch('/api/me');
        const data = await res.json();
        
        // İsim alanlarını doldur
        const nameEls = document.querySelectorAll('#user-name');
        nameEls.forEach(el => el.innerText = data.username || 'User');
        
        // Resim alanlarını doldur
        if (data.image) {
            const avatarEls = document.querySelectorAll('#user-avatar');
            avatarEls.forEach(img => {
                img.src = data.image;
                img.style.display = 'block';
            });
            document.querySelectorAll('#user-avatar-placeholder').forEach(el => el.style.display = 'none');
        }
    } catch(e) { console.error("Profil hatası:", e); }
}

async function loadSavedPlaylists() {
    const list = document.getElementById('saved-playlists');
    if (!list) return; // Hata koruması

    try {
        const res = await fetch('/api/my-playlists');
        const data = await res.json();
        list.innerHTML = '';
        
        if (!data || data.length === 0) {
            list.innerHTML = '<li><span style="color:#777; font-size:12px;">No playlists yet.</span></li>';
            return;
        }

        data.forEach(pl => {
            const li = document.createElement('li');
            const link = pl.spotifyPlaylistId ? `https://open.spotify.com/playlist/${pl.spotifyPlaylistId}` : '#';
            li.innerHTML = `
                <a href="${link}" target="_blank" style="display:flex; align-items:center; color:#b3b3b3; text-decoration:none; margin-bottom:10px;">
                    <div class="playlist-thumbnail" style="width:40px; height:40px; background:#333; margin-right:10px; border-radius:5px;"></div>
                    <span style="font-size:14px;">${pl.playlistName.replace('Feelify: ', '')}</span>
                </a>`;
            list.appendChild(li);
        });
    } catch(e) { console.error("Playlist hatası:", e); }
}

// --- STATS YÜKLEME FONKSİYONU (DÜZELTİLDİ) ---
async function loadStats() {
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        
        if (data.error) {
            console.error("Stats API Hatası:", data.error);
            document.getElementById('loading-stats').innerHTML = `<p style="color:red">Veri alınamadı: ${data.error}</p>`;
            return;
        }

        console.log("Stats Verisi Geldi:", data);

        // Şarkıları Listele
        const tracksList = document.getElementById('tracks-list');
        tracksList.innerHTML = '';
        
        if (data.tracks && data.tracks.length > 0) {
            data.tracks.forEach((t, i) => {
                const img = t.album.images[0]?.url || '';
                const html = `
                    <a href="${t.external_urls.spotify}" target="_blank" class="list-item">
                        <div class="rank">${i + 1}</div>
                        <img src="${img}" alt="art">
                        <div class="info">
                            <span class="title">${t.name}</span>
                            <span class="artist">${t.artists[0].name}</span>
                        </div>
                    </a>`;
                tracksList.innerHTML += html;
            });
        } else {
            tracksList.innerHTML = '<p style="color:#777; padding:10px;">Henüz yeterli veri yok.</p>';
        }

        // Sanatçıları Listele
        const artistsList = document.getElementById('artists-list');
        artistsList.innerHTML = '';

        if (data.artists && data.artists.length > 0) {
            data.artists.forEach((a, i) => {
                const img = a.images[0]?.url || '';
                const html = `
                    <a href="${a.external_urls.spotify}" target="_blank" class="list-item">
                        <div class="rank">${i + 1}</div>
                        <img src="${img}" alt="artist" style="border-radius:50%;">
                        <div class="info">
                            <span class="title">${a.name}</span>
                        </div>
                    </a>`;
                artistsList.innerHTML += html;
            });
        } else {
            artistsList.innerHTML = '<p style="color:#777; padding:10px;">Henüz yeterli veri yok.</p>';
        }

        // Yükleme ekranını gizle, içeriği göster
        document.getElementById('loading-stats').style.display = 'none';
        document.getElementById('stats-content').style.display = 'flex';

    } catch(e) { 
        console.error("Stats yüklenemedi:", e); 
        document.getElementById('loading-stats').innerHTML = `<p style="color:red">Sunucu hatası.</p>`;
    }
}

async function generateMelody() {
    const input = document.getElementById('mood-prompt');
    const resultDiv = document.getElementById('playlist-results');
    const btn = document.getElementById('generate-button');
    
    if (input.value.length < 3) {
        alert("Please write something!");
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
                <div class="placeholder-card" style="border-left: 5px solid #1DB954;">
                    <h3>✅ ${data.mood}</h3>
                    <p>Playlist created based on your favorite artists!</p>
                    <a href="${data.playlist_url}" target="_blank" style="color: #1DB954; font-weight: bold; text-decoration: none;">🎵 Open in Spotify</a>
                </div>`;
            loadSavedPlaylists();
        } else {
            resultDiv.innerHTML = `<p style="color:red">Error: ${data.error}</p>`;
        }
    } catch (e) {
        resultDiv.innerHTML = `<p style="color:red">Connection error.</p>`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'GENERATE MY MELODY';
    }
}

// --- Kamera Fonksiyonları ---
let stream;
async function initCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        document.getElementById('video-feed').srcObject = stream;
    } catch(e) { alert("Camera permission denied"); }
}
function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
    }
}
function captureMood() {
    const input = document.getElementById('mood-prompt');
    const moods = ["I feel happy and energetic!", "I feel sad today...", "I need motivation for gym!", "I want to relax and chill."];
    input.value = moods[Math.floor(Math.random() * moods.length)] + " (AI Camera)";
    stopCamera();
    document.getElementById('camera-feed-container').style.display = 'none';
    document.getElementById('prompt-input-wrapper').style.display = 'flex';
}