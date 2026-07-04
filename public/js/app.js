document.addEventListener('DOMContentLoaded', async () => {
    await loadUserProfile();
    await loadSavedPlaylists();
    
    if (document.getElementById('stats-content')) {
        await loadStats();
    }

    const searchInput = document.getElementById('playlist-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const items = document.querySelectorAll('#saved-playlists li');
            items.forEach(item => {
                const titleEl = item.querySelector('.playlist-name');
                if (titleEl) {
                    const title = titleEl.textContent.toLowerCase();
                    item.style.display = title.includes(term) ? '' : 'none';
                }
            });
        });
    }

    const generateBtn = document.getElementById('generate-button');
    const cameraBtn = document.getElementById('camera-button');
    const goBackBtn = document.getElementById('go-back-button');
    const captureBtn = document.getElementById('capture-mood-button');

    if (generateBtn) generateBtn.addEventListener('click', generateMelody);
    
    if (cameraBtn) {
        cameraBtn.addEventListener('click', () => {
            initCamera();
            document.getElementById('prompt-input-wrapper').style.display = 'none';
            const genBtn = document.getElementById('generate-button');
            if (genBtn) genBtn.style.setProperty('display', 'none', 'important');
            document.getElementById('camera-feed-container').style.display = 'flex';
        });
    }

    if (goBackBtn) {
        goBackBtn.addEventListener('click', () => {
            stopCamera();
            document.getElementById('camera-feed-container').style.display = 'none';
            document.getElementById('prompt-input-wrapper').style.display = 'flex';
            const genBtn = document.getElementById('generate-button');
            genBtn.style.display = 'block';  
            genBtn.style.margin = '20px auto 0 auto';  
        });
    }
    
    if (captureBtn) captureBtn.addEventListener('click', captureMoodWithAI);
    setupModal();
    loadAIModels(); 
});

function setupModal() {
    const modal = document.getElementById("support-modal");
    const closeBtn = document.querySelector(".close-modal");
    const supportForm = document.getElementById("support-form");
    const helpBtns = document.querySelectorAll("#help-btn, #help-btn-stats, #help-btn-emotion");

    helpBtns.forEach(btn => { btn.addEventListener('click', (e) => { e.preventDefault(); if (modal) modal.style.display = "flex"; }); });
    if (closeBtn) closeBtn.onclick = () => { if (modal) modal.style.display = "none"; };
    if (modal) window.onclick = (e) => { if (e.target == modal) modal.style.display = "none"; };

    if (supportForm) {
        supportForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const message = document.getElementById("support-msg").value;
            const email = document.getElementById("user-email").value;
            const sendBtn = document.querySelector('.modal-send-btn');
            
            if(message.length < 5) { alert("Please describe your issue."); return; }
            sendBtn.innerHTML = 'Sending...'; sendBtn.disabled = true;

            try {
                const res = await fetch('/api/send-support', {
                    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ userEmail: email, message: message })
                });
                const data = await res.json();
                if(data.success) {
                    sendBtn.innerHTML = 'Sent!'; sendBtn.style.backgroundColor = '#1ed760';
                    setTimeout(() => {
                        if (modal) modal.style.display = "none";
                        document.getElementById("support-msg").value = ""; 
                        sendBtn.innerText = "Send Message"; sendBtn.style.backgroundColor = ""; sendBtn.disabled = false;
                    }, 1500);
                } else { alert("Error: " + data.error); sendBtn.innerText = "Try Again"; sendBtn.disabled = false; }
            } catch (err) { alert("Connection failed."); sendBtn.innerText = "Try Again"; sendBtn.disabled = false; }
        });
    }
}

async function generateMelody() {
    const input = document.getElementById('mood-prompt');
    const resultDiv = document.getElementById('playlist-results');
    const btn = document.getElementById('generate-button');
    
    if (input.value.length < 3) { alert("Please write something!"); return; }

    btn.disabled = true; 
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing Mood...';
    resultDiv.innerHTML = '<div class="placeholder-card"><p>AI is generating your perfect playlist...</p></div>';

    try {
        const res = await fetch('/api/generate-melody', {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ feeling_text: input.value })
        });
        const data = await res.json();
        
        if (data.success) {
            let cardsHtml = '';
            
            data.playlists.forEach(playlist => {
                const imgHtml = playlist.image 
                    ? `<img src="${playlist.image}" style="width: 100%; max-width: 250px; aspect-ratio: 1; border-radius: 8px; object-fit: cover; margin-bottom: 20px; box-shadow: 0 8px 24px rgba(0,0,0,0.5);">` 
                    : `<div style="width: 100%; max-width: 250px; aspect-ratio: 1; background: #282828; border-radius: 8px; display: flex; align-items: center; justify-content: center; margin-bottom: 20px; box-shadow: 0 8px 24px rgba(0,0,0,0.5);"><i class="fas fa-music" style="font-size: 60px; color: #b3b3b3;"></i></div>`;

                let tracksHtml = '';
                if (playlist.tracks && playlist.tracks.length > 0) {
                    playlist.tracks.forEach((track, index) => {
                        tracksHtml += `
                            <div class="track-list-item">
                                <span class="track-number">${index + 1}</span>
                                <div class="track-details">
                                    <span class="track-title">${track.trackName}</span>
                                    <span class="track-artist">${track.artistName}</span>
                                </div>
                            </div>
                        `;
                    });
                } else {
                    tracksHtml = `<p style="color:#b3b3b3; font-size:13px; padding: 10px;">Tracks couldn't be loaded.</p>`;
                }

                // "# Title" YERİNE DOĞRUDAN PLAYLIST ADI YAZDIRILDI
                cardsHtml += `
                    <div class="result-layout">
                        <div class="result-left">
                            ${imgHtml}
                            <h3 style="margin: 0 0 8px 0; color: white; font-size: 22px; font-weight: 800; text-align: center;">${playlist.name}</h3>
                            <p style="margin: 0 0 25px 0; color: #b3b3b3; font-size: 13px; font-weight: 500; text-align: center;">Playlist • Curated by AI</p>
                            
                            <a href="${playlist.url}" target="_blank" class="spotify-button" style="display: block; width: 100%; text-align: center; background: #1DB954; color: black; padding: 12px 0; border-radius: 500px; text-decoration: none; font-weight: 800; font-size: 14px; transition: 0.2s;">
                                Play on Spotify
                            </a>
                        </div>
                        
                        <div class="result-right">
                            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #282828; padding-bottom: 10px; margin-bottom: 10px;">
                                <span style="color: #b3b3b3; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">${playlist.name}</span>
                            </div>
                            <div class="track-list-container">
                                ${tracksHtml}
                            </div>
                        </div>
                    </div>
                `;
            });

            resultDiv.innerHTML = `<div style="display: flex; justify-content: center; width: 100%;">${cardsHtml}</div>`;
            setTimeout(loadSavedPlaylists, 2000);

        } else { resultDiv.innerHTML = `<p style="color:red">Error: ${data.error}</p>`; }
    } catch (e) { resultDiv.innerHTML = `<p style="color:red">Connection error.</p>`; } 
    finally { btn.disabled = false; btn.innerHTML = 'GENERATE MY MELODY'; }
}

async function loadSavedPlaylists() {
    const lists = document.querySelectorAll('#saved-playlists');
    if (lists.length === 0) return;
    lists.forEach(l => l.innerHTML = '<li style="padding:15px; color:#b3b3b3; font-size:13px;">Loading...</li>');
    try {
        const res = await fetch('/api/my-playlists');
        const data = await res.json();
        lists.forEach(list => {
            list.innerHTML = '';
            if (!data || data.length === 0) { list.innerHTML = '<li style="padding:15px; color:#777; font-size:13px;">No playlists found.</li>'; return; }
            data.forEach(pl => {
                const imgUrl = pl.images && pl.images.length > 0 ? pl.images[0].url : null;
                const li = document.createElement('li');
                li.innerHTML = `
                    <a href="${pl.external_urls.spotify}" target="_blank" class="playlist-item">
                        <img src="${imgUrl}" class="playlist-cover ${!imgUrl ? 'placeholder' : ''}">
                        <div class="playlist-info">
                            <span class="playlist-name">${pl.name}</span>
                            <span class="playlist-count">Playlist • ${pl.tracks.total} Songs</span>
                        </div>
                    </a>`;
                list.appendChild(li);
            });
        });
    } catch(e) { lists.forEach(l => l.innerHTML = '<li style="color:red; padding:15px;">Error loading library.</li>'); }
}

async function loadUserProfile() {
    try {
        const res = await fetch('/api/me');
        const data = await res.json();
        document.querySelectorAll('#user-name').forEach(el => el.innerText = data.username || 'User');
        const emailInput = document.getElementById('user-email');
        if (emailInput) emailInput.value = data.email || "Email not available";
        if (data.image) {
            document.querySelectorAll('#user-avatar').forEach(img => { img.src = data.image; img.style.display = 'block'; });
            document.querySelectorAll('#user-avatar-placeholder').forEach(el => el.style.display = 'none');
        }
    } catch(e) { console.log(e); }
}

async function loadStats() {
    const loadingEl = document.getElementById('loading-stats');
    const contentEl = document.getElementById('stats-content');
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        if (data.error) { if(loadingEl) loadingEl.innerHTML = `<p style="color:red">${data.error}</p>`; return; }
        const tracksList = document.getElementById('tracks-list');
        if(tracksList && data.tracks) {
            tracksList.innerHTML = '';
            data.tracks.forEach((t,i) => { tracksList.innerHTML += `<a href="${t.external_urls.spotify}" target="_blank" class="list-item"><div class="rank">${i+1}</div><img src="${t.album.images[0].url}" style="width:45px; height:45px; border-radius:4px; margin-right:12px;"><div class="info"><span class="title">${t.name}</span><span class="artist">${t.artists[0].name}</span></div></a>`; });
        }
        const artistsList = document.getElementById('artists-list');
        if(artistsList && data.artists) {
             artistsList.innerHTML = '';
             data.artists.forEach((a,i) => { artistsList.innerHTML += `<a href="${a.external_urls.spotify}" target="_blank" class="list-item"><div class="rank">${i+1}</div><img src="${a.images[0].url}" style="width:45px; height:45px; border-radius:50%; margin-right:12px;"><div class="info"><span class="title">${a.name}</span></div></a>`; });
        }
        if(loadingEl) loadingEl.style.display = 'none';
        if(contentEl) contentEl.style.display = 'flex';
    } catch(e) { console.log(e); }
}

async function loadAIModels() { if (typeof faceapi === 'undefined') return; const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models'; try { await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL); await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL); } catch (e) {} }
let stream; async function initCamera() { try { stream = await navigator.mediaDevices.getUserMedia({ video: {} }); document.getElementById('video-feed').srcObject = stream; } catch(e) { alert("Permission denied"); } }
function stopCamera() { if (stream) stream.getTracks().forEach(t => t.stop()); }
async function captureMoodWithAI() { 
    const video = document.getElementById('video-feed'); const input = document.getElementById('mood-prompt'); const container = document.getElementById('camera-feed-container'); 
    const overlay = document.createElement('div'); overlay.innerHTML = `<div style="position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); color:#1ed760; display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:999;"><i class="fas fa-brain fa-3x fa-spin"></i><h3>ANALYZING...</h3></div>`; container.appendChild(overlay);
    try { const detections = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions()).withFaceExpressions();
        setTimeout(() => { stopCamera(); overlay.remove(); container.style.display = 'none'; document.getElementById('prompt-input-wrapper').style.display = 'flex'; const genBtn = document.getElementById('generate-button'); genBtn.style.display = 'block'; genBtn.style.margin = '20px auto 0 auto';
            if (!detections) { alert("Face not detected."); return; }
            const exp = detections.expressions; let maxE = 'neutral'; let maxV = 0; for (const [e, v] of Object.entries(exp)) { if (v > maxV) { maxV = v; maxE = e; } }
            input.value = `I feel ${maxE}`; generateMelody();
        }, 1000); } catch(e) { stopCamera(); overlay.remove(); alert("AI Error"); }
}