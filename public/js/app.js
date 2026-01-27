// public/js/app.js - FINAL VERSION (Tabs + Dynamic Charts + Likes + Mood Lift)

// 1. SEKME DEĞİŞTİRME FONKSİYONU (Global Erişim İçin En Üste Ekledik)
window.switchTab = function(tabName) {
    const btnSpotify = document.getElementById('tab-spotify');
    const btnMood = document.getElementById('tab-mood');
    const viewSpotify = document.getElementById('view-spotify-stats');
    const viewMood = document.getElementById('view-mood-stats');

    if (tabName === 'spotify') {
        // Görünüm Değiştir
        if(viewSpotify) viewSpotify.style.display = 'flex';
        if(viewMood) viewMood.style.display = 'none';
        
        // Buton Stilleri (Aktif Yeşil, Pasif Gri)
        if(btnSpotify) { btnSpotify.style.background = '#1DB954'; btnSpotify.style.color = 'black'; }
        if(btnMood) { btnMood.style.background = 'transparent'; btnMood.style.color = '#b3b3b3'; }
    } else {
        // Görünüm Değiştir
        if(viewSpotify) viewSpotify.style.display = 'none';
        if(viewMood) viewMood.style.display = 'flex';
        
        // Buton Stilleri
        if(btnSpotify) { btnSpotify.style.background = 'transparent'; btnSpotify.style.color = '#b3b3b3'; }
        if(btnMood) { btnMood.style.background = '#1DB954'; btnMood.style.color = 'black'; }
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    
    // 2. Profil ve Playlistleri Yükle
    await loadUserProfile();
    await loadSavedPlaylists();
    
    // 3. Eğer Stats sayfasındaysak İstatistikleri Yükle
    if (document.getElementById('stats-content')) {
        await loadStats();
    }

    // 4. Buton Tanımlamaları ve Event Listenerlar
    const generateBtn = document.getElementById('generate-button');
    const cameraBtn = document.getElementById('camera-button');
    const goBackBtn = document.getElementById('go-back-button');
    const captureBtn = document.getElementById('capture-mood-button');

    if (generateBtn) generateBtn.addEventListener('click', generateMelody);
    
    if (cameraBtn) {
        cameraBtn.addEventListener('click', () => {
            console.log("Camera opened"); 
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
            if(genBtn) {
                genBtn.style.display = 'block';  
                genBtn.style.margin = '20px auto 0 auto';  
            }
        });
    }
    
    if (captureBtn) captureBtn.addEventListener('click', captureMoodWithAI);

    setupModal();
    loadAIModels(); 
});

// --- CHART.JS VE İSTATİSTİK FONKSİYONU (GÜNCEL & DİNAMİK RENKLİ) ---
async function loadStats() {
    const loadingEl = document.getElementById('loading-stats');
    const contentEl = document.getElementById('stats-content');
    
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();

        if (data.error) { 
            if(loadingEl) loadingEl.innerHTML = `<p style="color:red">Login required or No Data.</p>`; 
            return; 
        }

        // --- A: ESKİ VERİLERİ YÜKLE (TOP TRACKS & ARTISTS) ---
        const tracksList = document.getElementById('tracks-list');
        if(tracksList && data.tracks) {
            tracksList.innerHTML = '';
            data.tracks.forEach((t,i) => {
                 tracksList.innerHTML += `
                 <a href="${t.external_urls.spotify}" target="_blank" class="list-item" style="display:flex; align-items:center; margin-bottom:10px; text-decoration:none; padding:5px; border-radius:5px; transition:0.2s;">
                    <div class="rank" style="color:#1DB954; font-weight:bold; margin-right:10px; width:20px;">${i+1}</div>
                    <img src="${t.album.images[0].url}" style="width:40px; height:40px; border-radius:4px; margin-right:10px;">
                    <div class="info" style="overflow:hidden;">
                        <span class="title" style="color:white; font-size:13px; font-weight:bold; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${t.name}</span>
                        <span class="artist" style="color:#b3b3b3; font-size:11px;">${t.artists[0].name}</span>
                    </div>
                 </a>`;
            });
        }
        
        const artistsList = document.getElementById('artists-list');
        if(artistsList && data.artists) {
             artistsList.innerHTML = '';
             data.artists.forEach((a,i) => {
                 artistsList.innerHTML += `
                 <a href="${a.external_urls.spotify}" target="_blank" class="list-item" style="display:flex; align-items:center; margin-bottom:10px; text-decoration:none; padding:5px; border-radius:5px; transition:0.2s;">
                    <div class="rank" style="color:#1DB954; font-weight:bold; margin-right:10px; width:20px;">${i+1}</div>
                    <img src="${a.images[0].url}" style="width:40px; height:40px; border-radius:50%; margin-right:10px;">
                    <div class="info">
                        <span class="title" style="color:white; font-size:13px; font-weight:bold;">${a.name}</span>
                    </div>
                 </a>`;
             });
        }

        // --- B: YENİ DİNAMİK MOOD GRAFİĞİNİ YÜKLE ---
        if (data.moodData && data.moodData.total > 0) {
            const ctx = document.getElementById('moodChart');
            const desc = document.getElementById('chart-desc');
            
            // Eğer daha önce grafik çizildiyse temizle
            if (window.myMoodChart) { window.myMoodChart.destroy(); }

            // 1. Verileri Ayıkla (Breakdown Objesinden)
            const breakdown = data.moodData.breakdown || {};
            const labels = Object.keys(breakdown); 
            const counts = Object.values(breakdown);

            // 2. Renk Paleti (Otomatik Atama)
            const backgroundColors = labels.map(label => {
                if (label.includes('Lift')) return '#ff9900';   // Turuncu
                if (label.includes('Mirror')) return '#1DB954'; // Yeşil
                if (label.includes('General')) return '#9b59b6'; // Mor
                return '#3498db'; // Diğer durumlar için Mavi
            });

            // 3. Yorum Metni
            if (counts.length > 0) {
                const maxVal = Math.max(...counts);
                const dominantType = labels[counts.indexOf(maxVal)] || '';

                if (dominantType.includes('Lift')) {
                    desc.innerHTML = `You mostly prefer to <strong style="color:#ff9900">boost your mood</strong> when feeling down! 🚀`;
                } else if (dominantType.includes('Mirror')) {
                    desc.innerHTML = `You mostly prefer to <strong style="color:#1DB954">embrace your feelings</strong> with matching songs. 🌧️`;
                } else if (dominantType.includes('General')) {
                    desc.innerHTML = `You've been feeling <strong style="color:#9b59b6">Good & Positive</strong> lately! ✨`;
                } else {
                    desc.innerHTML = `Your musical taste is quite diverse lately! ☯️`;
                }
            }

            // 4. Grafik Çizimi
            if (ctx) {
                window.myMoodChart = new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: labels,
                        datasets: [{
                            data: counts,
                            backgroundColor: backgroundColors,
                            borderWidth: 0,
                            hoverOffset: 10
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        cutout: '65%', 
                        plugins: {
                            legend: {
                                position: 'bottom',
                                labels: { color: 'white', font: { family: 'Montserrat', size: 11 }, padding: 20 }
                            }
                        }
                    }
                });
            }
        } else {
            const container = document.querySelector('.chart-container');
            if(container) container.innerHTML = '<p style="color:#777; text-align:center; padding:20px;">No mood stats yet.<br>Create & like playlists to see data!</p>';
        }

        if(loadingEl) loadingEl.style.display = 'none';
        
        // İlk yüklemede Spotify sekmesini aç (Eğer henüz görünür değilse)
        const spotifyView = document.getElementById('view-spotify-stats');
        if(contentEl && (!spotifyView || spotifyView.style.display !== 'none')) {
             contentEl.style.display = 'flex';
             // switchTab('spotify'); // Bu satır opsiyonel, HTML'de zaten default display ayarlıysa gerekmez ama garanti olsun.
        }

    } catch(e) { console.log(e); }
}

// --- MELODY GENERATION (KALP BUTONLU) ---
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
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ feeling_text: input.value })
        });
        const data = await res.json();

        if (data.success) {
            let cardsHtml = '';
            
            data.playlists.forEach(playlist => {
                let borderStyle = 'border-top: 5px solid #1DB954;'; 
                if (playlist.name.includes('Booster') || playlist.name.includes('Happy') || playlist.name.includes('Energy')) {
                    borderStyle = 'border-top: 5px solid #ff9900;'; 
                }

                // Tırnak işaretlerini kaçış karakteriyle düzeltiyoruz
                const safeMood = input.value.replace(/'/g, "\\'");
                const safeName = playlist.name.replace(/'/g, "\\'");

                cardsHtml += `
                    <div class="result-card" style="position: relative; flex: 1; background: #181818; padding: 25px; border-radius: 10px; text-align: center; ${borderStyle} box-shadow: 0 5px 15px rgba(0,0,0,0.5);">
                        
                        <div onclick="saveLike(this, '${safeMood}', '${safeName}')" style="position: absolute; top: 15px; right: 15px; cursor: pointer; font-size: 22px; color: #b3b3b3; transition: 0.2s;" title="This matches my vibe!">
                            <i class="far fa-heart"></i>
                        </div>

                        <div style="font-size: 35px; margin-bottom: 10px;">
                            ${playlist.name.includes('Booster') ? '🚀' : '🎵'}
                        </div>
                        <h3 style="margin-bottom:10px; color:white; font-size: 18px;">${playlist.name}</h3>
                        <p style="color:#b3b3b3; font-size:12px; margin-bottom:20px;">
                            Matches your vibe.
                        </p>
                        <a href="${playlist.url}" target="_blank" class="spotify-button" style="display:inline-block; background:#1DB954; color:black; padding:10px 25px; border-radius:50px; text-decoration:none; font-weight:bold; font-size:14px; transition:0.2s;">
                            Play on Spotify
                        </a>
                    </div>
                `;
            });

            resultDiv.innerHTML = `
                <div style="display: flex; gap: 20px; flex-wrap: wrap; justify-content: center; width: 100%;">
                    ${cardsHtml}
                </div>
            `;
            
            setTimeout(loadSavedPlaylists, 2000);

        } else { 
            resultDiv.innerHTML = `<p style="color:red">Error: ${data.error}</p>`; 
        }
    } catch (e) { 
        console.error(e);
        resultDiv.innerHTML = `<p style="color:red">Connection error.</p>`; 
    } 
    finally { 
        btn.disabled = false; 
        btn.innerHTML = 'GENERATE MY MELODY'; 
    }
}

// --- BEĞENİ KAYDETME ---
async function saveLike(btn, mood, playlistName) {
    const icon = btn.querySelector('i');
    if (icon.classList.contains('fas')) return; // Zaten beğenilmiş

    // Görsel Efekt
    icon.classList.remove('far');
    icon.classList.add('fas');
    icon.style.color = '#e91e63';
    icon.classList.add('fa-beat');

    // API Çağrısı
    try {
        await fetch('/api/like-playlist', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ mood: mood, playlistName: playlistName })
        });
        console.log("Like saved!");
    } catch (e) { 
        console.error("Like failed", e);
        // Geri al
        icon.classList.remove('fas', 'fa-beat');
        icon.classList.add('far');
        icon.style.color = '#b3b3b3';
    }
}

// --- DİĞER YARDIMCI FONKSİYONLAR ---

function setupModal() {
    const modal = document.getElementById("support-modal");
    const closeBtn = document.querySelector(".close-modal");
    const supportForm = document.getElementById("support-form");
    const helpBtns = document.querySelectorAll("#help-btn, #help-btn-stats");

    helpBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (modal) modal.style.display = "flex";
        });
    });

    if (closeBtn) closeBtn.addEventListener('click', () => { if (modal) modal.style.display = "none"; });
    if (modal) window.addEventListener('click', (e) => { if (e.target == modal) modal.style.display = "none"; });

    if (supportForm) {
        supportForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const message = document.getElementById("support-msg").value;
            const email = document.getElementById("user-email").value;
            const sendBtn = document.querySelector('.modal-send-btn');
            
            if(message.length < 5) { alert("Please describe your issue."); return; }

            sendBtn.innerHTML = 'Sending...';
            sendBtn.disabled = true;

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
                        modal.style.display = "none";
                        document.getElementById("support-msg").value = ""; 
                        sendBtn.innerText = "Send Message";
                        sendBtn.style.backgroundColor = "";
                        sendBtn.disabled = false;
                    }, 1500);
                } else {
                    alert("Error: " + data.error);
                    sendBtn.disabled = false; sendBtn.innerText = "Try Again";
                }
            } catch (err) {
                alert("Connection failed.");
                sendBtn.disabled = false; sendBtn.innerText = "Try Again";
            }
        });
    }
}

async function loadSavedPlaylists() {
    const lists = document.querySelectorAll('#saved-playlists');
    if (lists.length === 0) return;
    lists.forEach(l => l.innerHTML = '<li style="padding:15px; color:#b3b3b3; font-size:12px;">Connecting...</li>');
    try {
        const res = await fetch('/api/my-playlists');
        const data = await res.json();
        lists.forEach(list => {
            list.innerHTML = '';
            if (!data || data.length === 0) {
                list.innerHTML = '<li style="padding:15px; color:#777; font-size:12px;">No playlists found.</li>';
                return;
            }
            data.forEach(pl => {
                const imgUrl = pl.images && pl.images.length > 0 ? pl.images[0].url : null;
                const imgHtml = imgUrl ? `<img src="${imgUrl}" class="playlist-cover" style="width:50px; height:50px; border-radius:6px; object-fit:cover; margin-right:15px;">` : `<div class="playlist-cover placeholder" style="width:50px; height:50px; background:#333; border-radius:6px; margin-right:15px; display:flex; align-items:center; justify-content:center;"><i class="fas fa-music"></i></div>`;
                const li = document.createElement('li');
                li.innerHTML = `<a href="${pl.external_urls.spotify}" target="_blank" class="playlist-item" style="display:flex; align-items:center; text-decoration:none; color:#b3b3b3; margin-bottom:10px; padding:8px; border-radius:8px; transition:0.2s;">${imgHtml}<div class="playlist-info" style="overflow:hidden;"><span class="playlist-name" style="font-size:14px; font-weight:700; color:white; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${pl.name}</span><span class="playlist-count" style="font-size:11px; color:#666;">${pl.tracks.total} Songs</span></div></a>`;
                list.appendChild(li);
            });
        });
    } catch(e) { lists.forEach(l => l.innerHTML = '<li style="color:red;">Error loading lists.</li>'); }
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

// --- AI CAMERA LOGIC ---
async function loadAIModels() {
    if (typeof faceapi === 'undefined') return;
    const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
    try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
    } catch (e) { console.error(e); }
}

let stream;
async function initCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: {} });
        document.getElementById('video-feed').srcObject = stream;
    } catch(e) { alert("Permission denied"); }
}
function stopCamera() { if (stream) stream.getTracks().forEach(t => t.stop()); }

async function captureMoodWithAI() {
    const video = document.getElementById('video-feed');
    const input = document.getElementById('mood-prompt');
    const container = document.getElementById('camera-feed-container');
    const overlay = document.createElement('div');
    overlay.innerHTML = `<div style="position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); color:#1ed760; display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:999;"><i class="fas fa-brain fa-3x fa-spin"></i><h3>ANALYZING...</h3></div>`;
    container.appendChild(overlay);
    
    try {
        const detections = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions()).withFaceExpressions();
        setTimeout(() => {
            if (detections) {
                const expressions = detections.expressions;
                let maxEmotion = 'neutral'; let maxValue = 0;
                for (const [emotion, value] of Object.entries(expressions)) {
                    if (value > maxValue) { maxValue = value; maxEmotion = emotion; }
                }
                let aiText = `Detected: ${maxEmotion.toUpperCase()}.`;
                if(maxEmotion === 'happy') aiText = "Detected Happiness! Upbeat vibes.";
                else if(maxEmotion === 'sad') aiText = "Detected Sadness. Acoustic vibes.";
                input.value = aiText + ` (${Math.round(maxValue*100)}%)`;
            } else { input.value = "Face not detected."; }
            
            stopCamera(); 
            overlay.remove(); 
            container.style.display = 'none';
            document.getElementById('prompt-input-wrapper').style.display = 'flex';
            
            const genBtn = document.getElementById('generate-button');
            if(genBtn) {
                genBtn.style.display = 'block';
                genBtn.style.margin = '20px auto 0 auto';
            }
        }, 1000);
    } catch(e) { stopCamera(); overlay.remove(); alert("AI Error"); }
}