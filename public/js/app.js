document.addEventListener('DOMContentLoaded', async () => {
    await loadUserProfile();
    await loadSavedPlaylists();
    
    if (document.getElementById('stats-content')) {
        await loadStats();
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

    helpBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (modal) modal.style.display = "flex";
        });
    });

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
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ userEmail: email, message: message })
                });
                const data = await res.json();
                if(data.success) {
                    sendBtn.innerHTML = 'Sent!';
                    sendBtn.style.backgroundColor = '#1ed760';
                    setTimeout(() => {
                        if (modal) modal.style.display = "none";
                        document.getElementById("support-msg").value = ""; 
                        sendBtn.innerText = "Send Message";
                        sendBtn.style.backgroundColor = "";
                        sendBtn.disabled = false;
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
    resultDiv.innerHTML = '<div class="placeholder-card"><p>AI is analyzing your feelings...</p></div>';

    try {
        const res = await fetch('/api/generate-melody', {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ feeling_text: input.value })
        });
        const data = await res.json();
        
        if (data.success) {
            let cardsHtml = '';
            
            data.playlists.forEach(playlist => {
                let borderStyle = 'border-top: 5px solid #1DB954;'; 
                let vibeIcon = '🎵';
                
                if (playlist.name.includes('Booster') || playlist.name.includes('Happy')) { 
                    borderStyle = 'border-top: 5px solid #ff9900;'; 
                    vibeIcon = '🚀'; 
                } 
                else if (playlist.name.includes('Anger') || playlist.name.includes('Release')) { 
                    borderStyle = 'border-top: 5px solid #e74c3c;'; 
                    vibeIcon = '🔥'; 
                }

                // Tek kart olacağı için max-width eklendi ki devasa olmasın
                cardsHtml += `
                    <div class="result-card" style="position: relative; flex: 1; min-width: 250px; max-width: 350px; background: #181818; padding: 25px; border-radius: 10px; text-align: center; ${borderStyle} box-shadow: 0 5px 15px rgba(0,0,0,0.5);">
                        
                        <div style="font-size: 35px; margin-bottom: 10px;">${vibeIcon}</div>
                        <h3 style="margin-bottom:10px; color:white; font-size: 18px;">${playlist.name}</h3>
                        <p style="color:#b3b3b3; font-size:12px; margin-bottom:20px;">Matches your vibe.</p>
                        
                        <a href="${playlist.url}" target="_blank" class="spotify-button" style="display:inline-block; background:#1DB954; color:black; padding:10px 25px; border-radius:50px; text-decoration:none; font-weight:bold; font-size:14px; transition:0.2s;">
                            Play on Spotify
                        </a>
                    </div>
                `;
            });

            resultDiv.innerHTML = `<div style="display: flex; gap: 20px; flex-wrap: wrap; justify-content: center; width: 100%;">${cardsHtml}</div>`;
            setTimeout(loadSavedPlaylists, 2000);

        } else { resultDiv.innerHTML = `<p style="color:red">Error: ${data.error}</p>`; }
    } catch (e) { resultDiv.innerHTML = `<p style="color:red">Connection error.</p>`; } 
    finally { btn.disabled = false; btn.innerHTML = 'GENERATE MY MELODY'; }
}

async function loadSavedPlaylists() {
    const lists = document.querySelectorAll('#saved-playlists');
    if (lists.length === 0) return;
    lists.forEach(l => l.innerHTML = '<li style="padding:15px; color:#b3b3b3; font-size:12px;">Loading...</li>');
    try {
        const res = await fetch('/api/my-playlists');
        const data = await res.json();
        lists.forEach(list => {
            list.innerHTML = '';
            if (!data || data.length === 0) { list.innerHTML = '<li style="padding:15px; color:#777; font-size:12px;">No playlists found.</li>'; return; }
            data.forEach(pl => {
                const imgUrl = pl.images && pl.images.length > 0 ? pl.images[0].url : null;
                const li = document.createElement('li');
                li.innerHTML = `
                    <a href="${pl.external_urls.spotify}" target="_blank" class="playlist-item" style="display:flex; align-items:center; text-decoration:none; color:#b3b3b3; margin-bottom:10px; padding:8px; border-radius:8px; transition:0.2s; font-family: 'Montserrat', sans-serif;">
                        <img src="${imgUrl}" class="playlist-cover ${!imgUrl ? 'placeholder' : ''}" style="width:40px; height:40px; border-radius:6px; object-fit:cover; margin-right:15px;">
                        <div class="playlist-info" style="overflow:hidden;">
                            <span class="playlist-name" style="font-size:13px; font-weight:700; color:white; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${pl.name}</span>
                            <span class="playlist-count" style="font-size:10px; color:#666;">${pl.tracks.total} Songs</span>
                        </div>
                    </a>`;
                list.appendChild(li);
            });
        });
    } catch(e) { lists.forEach(l => l.innerHTML = '<li style="color:red;">Error</li>'); }
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
            data.tracks.forEach((t,i) => { tracksList.innerHTML += `<a href="${t.external_urls.spotify}" target="_blank" class="list-item"><div class="rank">${i+1}</div><img src="${t.album.images[0].url}" style="width:45px; height:45px; border-radius:5px; margin-right:12px;"><div class="info"><span class="title" style="color:white; font-weight:bold;">${t.name}</span><span class="artist" style="color:#b3b3b3; font-size:12px;">${t.artists[0].name}</span></div></a>`; });
        }
        const artistsList = document.getElementById('artists-list');
        if(artistsList && data.artists) {
             artistsList.innerHTML = '';
             data.artists.forEach((a,i) => { artistsList.innerHTML += `<a href="${a.external_urls.spotify}" target="_blank" class="list-item"><div class="rank">${i+1}</div><img src="${a.images[0].url}" style="width:45px; height:45px; border-radius:50%; margin-right:12px;"><div class="info"><span class="title" style="color:white; font-weight:bold;">${a.name}</span></div></a>`; });
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