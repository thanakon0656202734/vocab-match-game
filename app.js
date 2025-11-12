// ===== Utils =====
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const shuffle = arr => arr.map(v => [Math.random(), v]).sort((a,b)=>a[0]-b[0]).map(v=>v[1]);

// ===== Audio (สร้างแค่ครั้งเดียว) =====
const bgm         = new Audio("sounds/bgm.mp3");
const sCorrect    = new Audio("sounds/correct.mp3");
const sWrong      = new Audio("sounds/wrong.mp3");
const sPass       = new Audio("sounds/pass.mp3");
const sFail       = new Audio("sounds/fail.mp3");
const sClick      = new Audio("sounds/click.mp3");
bgm.loop = true; bgm.volume = 0.35;
[sCorrect,sWrong,sPass,sFail,sClick].forEach(a=>a.volume=0.7);

// ===== TTS: English (สำเนียงเลือกได้ ถ้ามี #voiceSelect) =====
const TTS = {
  enabled: true,
  voices: [],
  ready: false,
  prefKey: "match_voice_en_pref", // เก็บค่าที่เลือกไว้
  langPref: null,                 // เช่น "en-GB" | "en-US" | "" (Auto)

  load(){
    if (!('speechSynthesis' in window)) return;
    this.langPref = localStorage.getItem(this.prefKey) ?? "";
    const set = () => { this.voices = speechSynthesis.getVoices(); this.ready = true; };
    set();
    speechSynthesis.onvoiceschanged = set;

    // ถ้ามี dropdown ให้ sync ค่า
    const sel = $("#voiceSelect");
    if (sel) {
      sel.value = this.langPref || "";
      sel.addEventListener("change", ()=>{
        this.langPref = sel.value || "";
        localStorage.setItem(this.prefKey, this.langPref);
        this.prime();
      });
    }
  },

  pickVoice(){
    if (!this.ready) return null;
    const list = this.voices || [];
    const en = list.filter(v => (v.lang||"").toLowerCase().startsWith("en"));
    if (en.length === 0) return null;

    const pref = (this.langPref||"").toLowerCase();

    // ถ้าเลือกไว้ (en-GB/en-US/...) ให้หาตามนั้นก่อน
    if (pref) {
      const exact = en.find(v => (v.lang||"").toLowerCase() === pref);
      if (exact) return exact;
      const starts = en.find(v => (v.lang||"").toLowerCase().startsWith(pref));
      if (starts) return starts;
    }

    // Auto: พยายามเลือกแบรนด์เสียงที่คุณภาพดี
    const branded = en.filter(v => /google|microsoft|apple/i.test(v.name));
    if (branded.length) {
      const rank = v => {
        const L = (v.lang||"").toLowerCase();
        if (L === "en-gb") return 0;
        if (L === "en-us") return 1;
        if (L === "en-au") return 2;
        if (L === "en-ca") return 3;
        if (L === "en-in") return 4;
        return 5;
      };
      branded.sort((a,b)=>rank(a)-rank(b));
      return branded[0];
    }
    return en[0];
  },

  speakEN(text){
    if (!this.enabled || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    const v = this.pickVoice();
    if (v) {
      u.voice = v;
      u.lang = this.langPref || v.lang || "en-GB";
    } else {
      u.lang = this.langPref || "en-GB";
    }
    u.rate = 0.95; u.pitch = 1.0; u.volume = 1.0;

    speechSynthesis.cancel();   // กันเสียงซ้อน
    speechSynthesis.speak(u);
  },

  // เรียก 1 ครั้งหลังมี user interaction เพื่อปลดล็อกเสียงบนมือถือ
  prime(){
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(".");
    u.volume = 0; u.rate = 1; u.lang = this.langPref || "en-GB";
    speechSynthesis.speak(u);
  }
};

// ===== Game Config =====
const WORDS_PER_LEVEL = 10;  // ใช้ 10 คำต่อด่าน
const SHOW_PAIRS = 5;        // โชว์ 5 คู่ (=10 tiles)
const PASS_POINTS = 5;       // ผ่านเมื่อจับคู่ถูก 5 คู่
const MAX_MISTAKES = 3;

const GAME = {
  level: 1, score: 0, mistakes: 0, progress: 0,
  enSel: null, thSel: null, current: [],

  init() {
    // โหลด TTS
    TTS.load();

    // กัน autoplay: เล่นเพลง/prime เสียง หลังมี interaction ครั้งแรกเท่านั้น
    const askPlay = sessionStorage.getItem('play_bgm') === '1';
    const firstInteract = () => {
      bgm.play().catch(()=>{});
      TTS.prime();
      document.removeEventListener('pointerdown', firstInteract);
    };
    if (askPlay) document.addEventListener('pointerdown', firstInteract, { once:true });

    // ปุ่ม mute (คุมทั้งเอฟเฟกต์ + TTS)
    $("#muteBtn")?.addEventListener('click', () => {
      const muted = !bgm.muted;
      [bgm,sCorrect,sWrong,sPass,sFail,sClick].forEach(a => a.muted = muted);
      TTS.enabled = !muted; // ปิด/เปิดเสียงอ่านอังกฤษด้วย
      $("#muteBtn").textContent = muted ? "🔇" : "🔈";
    });

    this.buildLevel();
    this.updateLabels();
  },

  buildLevel() {
    const left = $("#leftGrid"), right = $("#rightGrid");
    left.innerHTML = ""; right.innerHTML = "";

    // เลือกคำตามลำดับใน WORD_BANK เพื่อให้เลเวลแรก ๆ ง่ายก่อน
    const start = (this.level - 1) * WORDS_PER_LEVEL;
    const tenWords = (window.WORD_BANK || []).slice(start, start + WORDS_PER_LEVEL);

    // เผื่อกรณีคำไม่พอ (ท้ายคลัง) ให้สุ่มจากทั้งคลังเติมให้ครบ
    const pool = tenWords.length === WORDS_PER_LEVEL ? tenWords : shuffle(window.WORD_BANK).slice(0, WORDS_PER_LEVEL);

    const selected = shuffle(pool).slice(0, SHOW_PAIRS);
    this.current = selected;  // [[en,th] x5]

    // สร้างฝั่ง EN (คลิกแล้วอ่านเสียง)
    shuffle(selected).forEach(([en]) => {
      const t = document.createElement('div');
      t.className = 'tile'; t.textContent = en;
      t.onclick = () => {
        sClick.currentTime = 0; sClick.play();
        TTS.speakEN(en);               // ✅ อ่านออกเสียงอังกฤษ
        this.pickEN(t, en);
      };
      left.appendChild(t);
    });

    // สร้างฝั่ง TH (สลับตำแหน่ง)
    shuffle(selected).forEach(([en, th]) => {
      const t = document.createElement('div');
      t.className = 'tile'; t.textContent = th;
      t.onclick = () => {
        sClick.currentTime = 0; sClick.play();
        this.pickTH(t, en);
      };
      right.appendChild(t);
    });

    // เคลียร์สถานะ
    this.enSel = this.thSel = null;
    this.progress = 0; this.mistakes = 0;
    this.updateLabels();
  },

  pickEN(tile, en) {
    $$(".tile.selected").forEach(t => t.classList.remove('selected'));
    tile.classList.add('selected');
    this.enSel = { tile, en };
  },

  pickTH(tile, enFromTH) {
    if (!this.enSel) { tile.classList.add('selected'); setTimeout(()=>tile.classList.remove('selected'), 250); return; }

    const ok = this.enSel.en === enFromTH;
    if (ok) {
      sCorrect.currentTime = 0; sCorrect.play();
      this.enSel.tile.classList.add('matched');
      tile.classList.add('matched');
      this.score++; this.progress++;
      this.toast('ถูกต้อง!', true);
      // ปิดการคลิก
      this.enSel.tile.onclick = null; tile.onclick = null;
    } else {
      sWrong.currentTime = 0; sWrong.play();
      tile.classList.add('wrong'); this.enSel.tile.classList.add('wrong');
      setTimeout(()=>{ tile.classList.remove('wrong'); this.enSel.tile.classList.remove('wrong'); }, 450);
      this.mistakes++;
      this.toast('ผิด!', false);
    }
    this.enSel = null;
    this.updateLabels();
    this.checkStatus();
  },

  checkStatus() {
    if (this.progress >= PASS_POINTS) {
      sPass.currentTime = 0; sPass.play();
      setTimeout(()=> {
        this.level++; this.buildLevel();
      }, 500);
    } else if (this.mistakes >= MAX_MISTAKES) {
      sFail.currentTime = 0; sFail.play();
      setTimeout(()=> {
        this.buildLevel();
      }, 500);
    }
  },

  updateLabels() {
    $("#levelLabel") && ($("#levelLabel").textContent    = this.level);
    $("#scoreLabel") && ($("#scoreLabel").textContent    = this.score);
    $("#mistakeLabel") && ($("#mistakeLabel").textContent  = `${this.mistakes}/${MAX_MISTAKES}`);
    $("#progressLabel") && ($("#progressLabel").textContent = `${this.progress}/${PASS_POINTS}`);
  },

  toast(msg, ok=true){
    const t = $("#toast");
    if (!t) return;
    t.textContent = msg; t.className = `toast ${ok?'ok':'err'}`; t.hidden = false;
    setTimeout(()=> t.hidden = true, 900);
  }
};

window.addEventListener('DOMContentLoaded', () => GAME.init());
