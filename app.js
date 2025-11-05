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

// ===== Game Config =====
const WORDS_PER_LEVEL = 10;  // ใช้ 10 คำต่อด่าน
const SHOW_PAIRS = 5;        // โชว์ 5 คู่ (=10 tiles)
const PASS_POINTS = 5;       // ผ่านเมื่อจับคู่ถูก 5 คู่
const MAX_MISTAKES = 3;

const GAME = {
  level: 1, score: 0, mistakes: 0, progress: 0,
  enSel: null, thSel: null, current: [],

  init() {
    // กัน autoplay: เล่นเพลงหลังมี interaction ครั้งแรกเท่านั้น
    const askPlay = sessionStorage.getItem('play_bgm') === '1';
    const startBgm = () => { bgm.play().catch(()=>{}); document.removeEventListener('pointerdown', startBgm); };
    if (askPlay) document.addEventListener('pointerdown', startBgm, { once:true });

    // ปุ่ม mute
    $("#muteBtn").addEventListener('click', () => {
      const muted = !bgm.muted;
      [bgm,sCorrect,sWrong,sPass,sFail,sClick].forEach(a => a.muted = muted);
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

    // สร้างฝั่ง EN
    shuffle(selected).forEach(([en]) => {
      const t = document.createElement('div');
      t.className = 'tile'; t.textContent = en;
      t.onclick = () => this.pickEN(t, en);
      left.appendChild(t);
    });

    // สร้างฝั่ง TH (สลับตำแหน่ง)
    shuffle(selected).forEach(([en, th]) => {
      const t = document.createElement('div');
      t.className = 'tile'; t.textContent = th;
      t.onclick = () => this.pickTH(t, en);
      right.appendChild(t);
    });

    // เคลียร์สถานะ
    this.enSel = this.thSel = null;
    this.progress = 0; this.mistakes = 0;
    this.updateLabels();
  },

  pickEN(tile, en) {
    sClick.currentTime = 0; sClick.play();
    $$(".tile.selected").forEach(t => t.classList.remove('selected'));
    tile.classList.add('selected');
    this.enSel = { tile, en };
  },

  pickTH(tile, enFromTH) {
    sClick.currentTime = 0; sClick.play();
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
    $("#levelLabel").textContent    = this.level;
    $("#scoreLabel").textContent    = this.score;
    $("#mistakeLabel").textContent  = `${this.mistakes}/${MAX_MISTAKES}`;
    $("#progressLabel").textContent = `${this.progress}/${PASS_POINTS}`;
  },

  toast(msg, ok=true){
    const t = $("#toast");
    t.textContent = msg; t.className = `toast ${ok?'ok':'err'}`; t.hidden = false;
    setTimeout(()=> t.hidden = true, 900);
  }
};

window.addEventListener('DOMContentLoaded', () => GAME.init());
