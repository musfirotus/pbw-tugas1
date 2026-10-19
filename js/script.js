/* =========================================================
   SITTA Praktik - script.js
   Satu file untuk empat halaman. Halaman mana yang aktif
   dibaca dari atribut <body data-page="...">, lalu hanya
   modul halaman itu yang dijalankan (lihat bagian paling bawah).

   Isi file:
     1. Konstanta & utilitas
     2. Penyimpanan (localStorage / sessionStorage)
     3. Komponen bersama: tema, toast, modal, konfirmasi, error form
     4. Data helper: bahan ajar, pengguna, tracking
     5. Shell halaman dalam (sidebar, jam, user, logout)
     6. Halaman Login
     7. Halaman Dashboard
     8. Halaman Tracking
     9. Halaman Stok
    10. Titik masuk
   ========================================================= */
"use strict";

/* ---------- 1. Konstanta & utilitas ---------- */
const KEY = {
  session: "sitta_session",
  usersBaru: "sitta_pengguna_baru",
  stok: "sitta_bahan_ajar",
  tema: "sitta_tema",
  ingatEmail: "sitta_ingat_email",
  doTerakhir: "sitta_do_terakhir",
  loginGagal: "sitta_login_gagal",
  viewStok: "sitta_view_stok"
};
const BATAS_STOK_MENIPIS = 200;
const MAKS_GAGAL_LOGIN = 3;
const LAMA_KUNCI_DETIK = 30;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// Semua teks dari data/inputan pengguna lewat sini sebelum masuk innerHTML
function esc(teks) {
  return String(teks ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

const fmtAngka = new Intl.NumberFormat("id-ID");
const fmtRupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

// "Rp 180.000" -> 180000
function parseRupiah(teks) {
  return Number(String(teks).replace(/[^\d]/g, "")) || 0;
}

// "2025-08-25" -> Date lokal (bukan UTC, supaya tanggal tidak mundur sehari)
function keTanggal(iso) {
  const [tgl, jam = "00:00:00"] = String(iso).split(" ");
  const [y, m, d] = tgl.split("-").map(Number);
  const [hh, mm, ss] = jam.split(":").map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, ss || 0);
}
function fmtTanggal(iso) {
  return keTanggal(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}
function fmtWaktu(iso) {
  return keTanggal(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

/* ---------- 2. Penyimpanan ---------- */
// Dibungkus try/catch karena storage bisa diblokir (mode privat, kuota penuh)
const store = {
  get(key, cadangan, area = "local") {
    try {
      const raw = window[area + "Storage"].getItem(key);
      return raw === null ? cadangan : JSON.parse(raw);
    } catch (e) {
      return cadangan;
    }
  },
  set(key, nilai, area = "local") {
    try {
      window[area + "Storage"].setItem(key, JSON.stringify(nilai));
      return true;
    } catch (e) {
      return false;
    }
  },
  remove(key, area = "local") {
    try { window[area + "Storage"].removeItem(key); } catch (e) { /* abaikan */ }
  }
};

/* ---------- 3. Komponen bersama ---------- */

// 3a. Tema terang/gelap
function terapkanTema(tema) {
  document.documentElement.dataset.theme = tema;
  $$("[data-theme-toggle]").forEach((btn) => {
    btn.textContent = tema === "dark" ? "☀️" : "🌙";
    btn.setAttribute("aria-label", tema === "dark" ? "Pakai mode terang" : "Pakai mode gelap");
  });
}
function initTema() {
  const gelapSistem = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  terapkanTema(store.get(KEY.tema, gelapSistem ? "dark" : "light"));
  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-theme-toggle]")) return;
    const baru = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    terapkanTema(baru);
    store.set(KEY.tema, baru);
  });
}

// 3b. Toast (notifikasi kecil di pojok kanan bawah)
function toast(pesan, jenis = "ok") {
  const wadah = $("#toastStack");
  if (!wadah) return;
  const ikon = { ok: "✅", error: "⛔", warn: "⚠️" }[jenis] || "ℹ️";
  const el = document.createElement("div");
  el.className = "toast " + jenis;
  el.setAttribute("role", jenis === "error" ? "alert" : "status");
  el.innerHTML = `<span aria-hidden="true">${ikon}</span><div>${esc(pesan)}</div>`;
  wadah.appendChild(el);
  setTimeout(() => {
    el.classList.add("hide");
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }, 3800);
}

// 3c. Modal box
let fokusSebelumModal = null;

function bukaModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  fokusSebelumModal = document.activeElement;
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add("open"));
  document.body.classList.add("modal-open");
  const target = modal.querySelector("input:not([type=hidden]), select, textarea, [data-confirm='no']");
  setTimeout(() => target && target.focus(), 80);
}

function tutupModal(modal) {
  if (typeof modal === "string") modal = document.getElementById(modal);
  if (!modal || !modal.classList.contains("open")) return;
  modal.classList.remove("open");
  setTimeout(() => {
    if (!modal.classList.contains("open")) modal.hidden = true;
  }, 220);
  if (!$(".modal.open")) document.body.classList.remove("modal-open");
  if (fokusSebelumModal) fokusSebelumModal.focus();
  modal.dispatchEvent(new CustomEvent("modal:tutup"));
}

function initModal() {
  document.addEventListener("click", (e) => {
    const pembuka = e.target.closest("[data-open-modal]");
    if (pembuka) bukaModal(pembuka.dataset.openModal);

    const penutup = e.target.closest("[data-close-modal]");
    if (penutup) tutupModal(penutup.closest(".modal"));

    // klik area gelap di luar kotak modal
    if (e.target.classList.contains("modal")) tutupModal(e.target);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const terbuka = $$(".modal.open").pop();
    if (terbuka) tutupModal(terbuka);
  });
}

// 3d. Konfirmasi versi modal (pengganti window.confirm yang tampilannya kaku)
function konfirmasi(pesan, { judul = "Yakin?", tombolYa = "Ya, lanjut" } = {}) {
  const modal = $("#modalConfirm");
  if (!modal) return Promise.resolve(window.confirm(pesan));

  $("#confirmTitle").textContent = judul;
  $("#confirmText").textContent = pesan;
  modal.querySelector("[data-confirm='yes']").textContent = tombolYa;
  bukaModal("modalConfirm");

  return new Promise((resolve) => {
    const selesai = (hasil) => {
      modal.removeEventListener("click", onKlik);
      modal.removeEventListener("modal:tutup", onTutup);
      tutupModal(modal);
      resolve(hasil);
    };
    const onKlik = (e) => {
      const btn = e.target.closest("[data-confirm]");
      if (btn) selesai(btn.dataset.confirm === "yes");
    };
    const onTutup = () => selesai(false);
    modal.addEventListener("click", onKlik);
    modal.addEventListener("modal:tutup", onTutup);
  });
}

// 3e. Pesan error di bawah input. Elemen pesan punya id = id input + "Err"
function setError(input, pesan) {
  const wadah = document.getElementById(input.id + "Err");
  input.setAttribute("aria-invalid", pesan ? "true" : "false");
  if (wadah) wadah.textContent = pesan || "";
}
function bersihkanError(form) {
  $$(".input", form).forEach((i) => setError(i, ""));
}
// Error hilang begitu pengguna mulai memperbaiki isian
function pasangHapusErrorOtomatis(form) {
  form.addEventListener("input", (e) => {
    if (e.target.matches(".input")) setError(e.target, "");
  });
  form.addEventListener("change", (e) => {
    if (e.target.matches("select.input")) setError(e.target, "");
  });
}
// Fokus ke input pertama yang salah; kembalikan true kalau form bersih
function cekForm(form, daftarError) {
  let pertama = null;
  daftarError.forEach(([input, pesan]) => {
    setError(input, pesan);
    if (pesan && !pertama) pertama = input;
  });
  if (pertama) pertama.focus();
  return !pertama;
}

function goyangkan(el) {
  el.classList.remove("shake");
  void el.offsetWidth; // paksa reflow supaya animasi bisa diulang
  el.classList.add("shake");
}

/* ---------- 4. Data helper ---------- */
function semuaPengguna() {
  return dataPengguna.concat(store.get(KEY.usersBaru, []));
}

function ambilBahanAjar() {
  const tersimpan = store.get(KEY.stok, null);
  return Array.isArray(tersimpan) ? tersimpan : dataBahanAjar.map((b) => ({ ...b }));
}
function simpanBahanAjar(daftar) {
  return store.set(KEY.stok, daftar);
}

// Cover cadangan berbentuk SVG, dibuat langsung dari kode barang
function coverCadangan(kode) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400">
    <rect width="300" height="400" fill="#1d4d3a"/>
    <rect x="24" y="24" width="252" height="352" fill="none" stroke="#e8dcc6" stroke-width="2"/>
    <text x="150" y="190" fill="#f6f1e7" font-family="Georgia,serif" font-size="34" text-anchor="middle">${esc(kode)}</text>
    <text x="150" y="232" fill="#c8643b" font-family="sans-serif" font-size="16" text-anchor="middle">BAHAN AJAR UT</text>
  </svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

// Pasang src cover. Kalau file .jpg tidak ada, coba .jpeg; masih gagal, pakai cover cadangan.
function pasangCover(img, item) {
  img.alt = "Cover " + item.namaBarang;
  img.loading = "lazy";
  img.addEventListener("error", function gagal() {
    if (!img.dataset.cobaJpeg && /\.jpg$/i.test(img.src)) {
      img.dataset.cobaJpeg = "1";
      img.src = img.src.replace(/\.jpg$/i, ".jpeg");
    } else {
      img.removeEventListener("error", gagal);
      img.src = coverCadangan(item.kodeBarang);
    }
  });
  img.src = item.cover || coverCadangan(item.kodeBarang);
}

// Paket di dataTracking memakai kode yang sama dengan kodeLokasi di dataBahanAjar
function namaPaket(kode) {
  const b = ambilBahanAjar().find((x) => x.kodeLokasi === kode);
  return b ? `${b.namaBarang} (${b.kodeBarang})` : "Paket tidak dikenal";
}

// Tahap pengiriman, dicocokkan dengan teks keterangan di riwayat perjalanan
const TAHAP = [
  { label: "Diterima di loket", pola: /penerimaan/i },
  { label: "Tiba di hub", pola: /tiba di hub/i },
  { label: "Diteruskan", pola: /diteruskan/i },
  { label: "Diantar kurir", pola: /proses antar/i },
  { label: "Selesai", pola: /selesai/i }
];
// Pakai tahap terjauh, bukan entri terakhir, supaya urutan data yang acak tidak bikin progres mundur
function tahapTerjauh(perjalanan) {
  let maks = -1;
  perjalanan.forEach((p) => {
    TAHAP.forEach((t, i) => {
      if (t.pola.test(p.keterangan) && i > maks) maks = i;
    });
  });
  return maks;
}
function persenProgres(perjalanan) {
  return Math.round(((tahapTerjauh(perjalanan) + 1) / TAHAP.length) * 100);
}
function updateTerakhir(perjalanan) {
  return perjalanan.reduce((a, b) => (b.waktu > a ? b.waktu : a), "");
}
function badgeStatus(status) {
  const kelas = /selesai|diterima/i.test(status) ? "badge-ok"
    : /perjalanan/i.test(status) ? "badge-warn"
    : "badge-clay";
  return `<span class="badge ${kelas}">${esc(status)}</span>`;
}

/* ---------- 5. Shell halaman dalam ---------- */
function initShell(user) {
  const inisial = user.nama.split(" ").map((k) => k[0]).slice(0, 2).join("").toUpperCase();
  $$("[data-user-initial]").forEach((el) => (el.textContent = inisial));
  $$("[data-user-name]").forEach((el) => (el.textContent = user.nama));
  $$("[data-user-role]").forEach((el) => (el.textContent = `${user.role} · ${user.lokasi}`));

  // Jam digital di topbar
  const jam = $$("[data-clock]");
  const tick = () => {
    const now = new Date();
    jam.forEach((el) => {
      el.textContent = now.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" }) +
        " · " + now.toLocaleTimeString("id-ID");
    });
  };
  tick();
  setInterval(tick, 1000);

  // Sidebar versi HP
  const toggle = $("[data-menu-toggle]");
  if (toggle) {
    toggle.addEventListener("click", () => {
      const buka = document.body.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", String(buka));
    });
    $$("#sidebar a").forEach((a) => a.addEventListener("click", () => document.body.classList.remove("nav-open")));
    document.addEventListener("click", (e) => {
      if (document.body.classList.contains("nav-open") && !e.target.closest("#sidebar, [data-menu-toggle]")) {
        document.body.classList.remove("nav-open");
      }
    });
  }

  // Logout
  $$("[data-logout]").forEach((btn) => btn.addEventListener("click", async () => {
    const ya = await konfirmasi(`Keluar dari akun ${user.nama}? Data stok yang sudah kamu tambahkan tetap tersimpan di browser ini.`, {
      judul: "Keluar dari SITTA", tombolYa: "Keluar"
    });
    if (!ya) return;
    store.remove(KEY.session, "session");
    location.replace("index.html");
  }));
}

/* ---------- 6. Halaman Login ---------- */
function halamanLogin() {
  const form = $("#loginForm");
  const email = $("#loginEmail");
  const pass = $("#loginPass");
  const btnLogin = $("#btnLogin");
  const kartu = $(".login-card");
  const catatanKunci = $("#lockNote");

  // Angka ringkas di panel kiri, dihitung dari data.js
  const totalStok = dataBahanAjar.reduce((s, b) => s + b.stok, 0);
  $("#loginFacts").innerHTML = `
    <div><b>${dataBahanAjar.length}</b><span>judul bahan ajar</span></div>
    <div><b>${fmtAngka.format(totalStok)}</b><span>eksemplar di gudang</span></div>
    <div><b>${Object.keys(dataTracking).length}</b><span>DO sedang dipantau</span></div>`;

  // Daftar akun uji coba: klik untuk isi form
  const ul = $("#demoAccounts");
  semuaPengguna().forEach((u) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-link small";
    btn.textContent = `${u.email} (${u.role})`;
    btn.addEventListener("click", () => {
      email.value = u.email;
      pass.value = u.password;
      bersihkanError(form);
      btnLogin.focus();
    });
    li.appendChild(btn);
    ul.appendChild(li);
  });

  // Ingat email
  const emailTersimpan = store.get(KEY.ingatEmail, "");
  if (emailTersimpan) {
    email.value = emailTersimpan;
    $("#rememberEmail").checked = true;
  }

  // Tombol lihat/sembunyikan password (dipakai juga di form daftar)
  $$("[data-toggle-pass]").forEach((btn) => btn.addEventListener("click", () => {
    const input = document.getElementById(btn.dataset.togglePass);
    const lihat = input.type === "password";
    input.type = lihat ? "text" : "password";
    btn.textContent = lihat ? "Tutup" : "Lihat";
    btn.setAttribute("aria-label", lihat ? "Sembunyikan password" : "Tampilkan password");
  }));

  // Kunci sementara setelah beberapa kali salah
  let timerKunci = null;
  function cekKunci() {
    const info = store.get(KEY.loginGagal, { jumlah: 0, sampai: 0 }, "session");
    const sisa = Math.ceil((info.sampai - Date.now()) / 1000);
    if (sisa > 0) {
      btnLogin.disabled = true;
      catatanKunci.hidden = false;
      catatanKunci.textContent = `Terlalu banyak percobaan salah. Coba lagi dalam ${sisa} detik.`;
      clearTimeout(timerKunci);
      timerKunci = setTimeout(cekKunci, 1000);
      return true;
    }
    btnLogin.disabled = false;
    catatanKunci.hidden = true;
    return false;
  }
  cekKunci();

  pasangHapusErrorOtomatis(form);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (cekKunci()) return;

    const vEmail = email.value.trim();
    const vPass = pass.value;
    const valid = cekForm(form, [
      [email, !vEmail ? "Email belum diisi." : !isEmail(vEmail) ? "Format email belum benar, contoh: nama@ut.ac.id" : ""],
      [pass, !vPass ? "Password belum diisi." : vPass.length < 6 ? "Password minimal 6 karakter." : ""]
    ]);
    if (!valid) {
      goyangkan(kartu);
      return;
    }

    const user = semuaPengguna().find((u) => u.email.toLowerCase() === vEmail.toLowerCase() && u.password === vPass);

    if (!user) {
      const info = store.get(KEY.loginGagal, { jumlah: 0, sampai: 0 }, "session");
      info.jumlah += 1;
      goyangkan(kartu);
      // Pesan wajib dari soal, ditampilkan sebagai alert box bawaan browser
      alert("Email/password yang anda masukkan salah");
      if (info.jumlah >= MAKS_GAGAL_LOGIN) {
        info.jumlah = 0;
        info.sampai = Date.now() + LAMA_KUNCI_DETIK * 1000;
      } else {
        toast(`Sisa ${MAKS_GAGAL_LOGIN - info.jumlah} kali percobaan sebelum login dikunci sementara.`, "warn");
      }
      store.set(KEY.loginGagal, info, "session");
      cekKunci();
      pass.select();
      return;
    }

    // Berhasil: simpan sesi tanpa password
    const { password, ...sesi } = user;
    store.set(KEY.session, sesi, "session");
    store.remove(KEY.loginGagal, "session");
    if ($("#rememberEmail").checked) store.set(KEY.ingatEmail, user.email);
    else store.remove(KEY.ingatEmail);

    btnLogin.disabled = true;
    btnLogin.textContent = "Mengalihkan...";
    toast(`Halo ${user.nama.split(" ")[0]}, login berhasil.`);
    setTimeout(() => location.replace("dashboard.html"), 800);
  });

  // --- Modal Lupa Password ---
  const formLupa = $("#lupaForm");
  const lupaEmail = $("#lupaEmail");
  const lupaHasil = $("#lupaResult");
  pasangHapusErrorOtomatis(formLupa);

  formLupa.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = lupaEmail.value.trim();
    let pesan = "";
    if (!v) pesan = "Isi dulu email akunmu.";
    else if (!isEmail(v)) pesan = "Format email belum benar.";
    else if (!semuaPengguna().some((u) => u.email.toLowerCase() === v.toLowerCase())) pesan = "Email ini belum terdaftar di SITTA.";
    if (!cekForm(formLupa, [[lupaEmail, pesan]])) return;

    // Samarkan email: rina@ut.ac.id -> r***@ut.ac.id
    const [nama, domain] = v.split("@");
    lupaHasil.hidden = false;
    lupaHasil.className = "card";
    lupaHasil.style.cssText = "padding: .8rem 1rem; background: var(--forest-soft); box-shadow: none;";
    lupaHasil.innerHTML = `<strong>Tautan terkirim.</strong> Cek kotak masuk <b>${esc(nama[0])}***@${esc(domain)}</b>. ` +
      `<span class="muted small">(Simulasi: aplikasi ini belum punya server, jadi tidak ada email yang benar-benar dikirim.)</span>`;
    toast("Tautan reset password sudah dikirim.");
  });
  $("#modalLupa").addEventListener("modal:tutup", () => {
    formLupa.reset();
    bersihkanError(formLupa);
    lupaHasil.hidden = true;
  });

  // --- Modal Daftar ---
  const formDaftar = $("#daftarForm");
  pasangHapusErrorOtomatis(formDaftar);

  formDaftar.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = {
      nama: $("#regNama"), email: $("#regEmail"), role: $("#regRole"),
      lokasi: $("#regLokasi"), pass: $("#regPass"), pass2: $("#regPass2")
    };
    const v = {
      nama: f.nama.value.trim(), email: f.email.value.trim(), role: f.role.value,
      lokasi: f.lokasi.value.trim(), pass: f.pass.value, pass2: f.pass2.value
    };
    const sudahAda = semuaPengguna().some((u) => u.email.toLowerCase() === v.email.toLowerCase());

    const valid = cekForm(formDaftar, [
      [f.nama, !v.nama ? "Nama wajib diisi." : v.nama.length < 3 ? "Nama terlalu pendek." : /\d/.test(v.nama) ? "Nama tidak boleh mengandung angka." : ""],
      [f.email, !v.email ? "Email wajib diisi." : !isEmail(v.email) ? "Format email belum benar." : sudahAda ? "Email ini sudah terdaftar, silakan login." : ""],
      [f.role, !v.role ? "Pilih salah satu peran." : ""],
      [f.lokasi, !v.lokasi ? "Lokasi wajib diisi." : ""],
      [f.pass, !v.pass ? "Password wajib diisi." : v.pass.length < 6 ? "Minimal 6 karakter." : !(/[a-z]/i.test(v.pass) && /\d/.test(v.pass)) ? "Gabungkan huruf dan angka." : ""],
      [f.pass2, !v.pass2 ? "Ketik ulang password." : v.pass2 !== v.pass ? "Password tidak sama." : ""]
    ]);
    if (!valid) return;

    const baru = {
      id: Date.now(),
      nama: v.nama, email: v.email, password: v.pass,
      role: v.role, lokasi: v.lokasi
    };
    const list = store.get(KEY.usersBaru, []);
    list.push(baru);
    if (!store.set(KEY.usersBaru, list)) {
      toast("Browser menolak menyimpan data. Akun hanya berlaku sampai halaman ditutup.", "warn");
      dataPengguna.push(baru);
    }

    tutupModal("modalDaftar");
    formDaftar.reset();
    email.value = baru.email;
    pass.value = "";
    pass.focus();
    toast(`Akun ${baru.nama} berhasil dibuat. Silakan masukkan password untuk login.`);
  });
  $("#modalDaftar").addEventListener("modal:tutup", () => bersihkanError(formDaftar));
}

/* ---------- 7. Halaman Dashboard ---------- */
function sapaanSekarang(tgl = new Date()) {
  const jam = tgl.getHours();
  if (jam >= 4 && jam < 11) return { salam: "Selamat pagi", ikon: "🌅", pesan: "Mulai hari dengan mengecek kiriman yang belum sampai." };
  if (jam >= 11 && jam < 15) return { salam: "Selamat siang", ikon: "☀️", pesan: "Sudah makan siang? Rekap stok bisa menunggu lima menit." };
  if (jam >= 15 && jam < 18) return { salam: "Selamat sore", ikon: "🌇", pesan: "Waktu yang pas untuk menutup DO yang masih di jalan." };
  return { salam: "Selamat malam", ikon: "🌙", pesan: "Masih lembur? Semua perubahan tetap tersimpan di browser ini." };
}

function halamanDashboard(user) {
  // Greeting berdasarkan jam lokal
  const namaDepan = user.nama.split(" ")[0];
  function renderSapaan() {
    const now = new Date();
    const s = sapaanSekarang(now);
    $("#greetTitle").textContent = `${s.salam}, ${namaDepan}`;
    $("#greetSub").textContent = `${user.role} · ${user.lokasi}. ${s.pesan}`;
    $("#greetIcon").textContent = s.ikon;
    $("#greetDate").textContent = now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  renderSapaan();
  setInterval(renderSapaan, 60 * 1000);

  const bahan = ambilBahanAjar();
  const daftarDO = Object.entries(dataTracking);
  const totalStok = bahan.reduce((s, b) => s + Number(b.stok), 0);
  const belumSelesai = daftarDO.filter(([, d]) => persenProgres(d.perjalanan) < 100).length;

  $("#dashStats").innerHTML = [
    ["Judul bahan ajar", bahan.length],
    ["Total stok", fmtAngka.format(totalStok)],
    ["DO tercatat", daftarDO.length],
    ["DO belum tuntas", belumSelesai]
  ].map(([label, nilai]) => `<div class="card stat"><div class="label">${label}</div><div class="value">${nilai}</div></div>`).join("");

  // --- Router sederhana berbasis #hash ---
  const PANEL = {
    beranda: "Beranda",
    monitoring: "Monitoring Progress DO",
    rekap: "Rekap Bahan Ajar",
    histori: "Histori Transaksi"
  };
  const sudahDirender = {};

  function tampilkanPanel() {
    const nama = location.hash.slice(1);
    const aktif = PANEL[nama] ? nama : "beranda";
    Object.keys(PANEL).forEach((p) => {
      $("#panel-" + p).hidden = p !== aktif;
    });
    $("#pageTitle").textContent = PANEL[aktif];
    document.title = `${PANEL[aktif]} | SITTA`;

    // Tandai menu sidebar yang aktif
    $$("#sidebar .nav a").forEach((a) => a.removeAttribute("aria-current"));
    const link = aktif === "beranda"
      ? $('#sidebar a[href="dashboard.html"]')
      : $(`#sidebar a[href="dashboard.html#${aktif}"]`);
    if (link) link.setAttribute("aria-current", "page");

    if (!sudahDirender[aktif]) {
      ({ monitoring: renderMonitoring, rekap: renderRekap, histori: renderHistori }[aktif] || (() => {}))();
      sudahDirender[aktif] = true;
    }
    window.scrollTo({ top: 0 });
  }
  window.addEventListener("hashchange", tampilkanPanel);
  tampilkanPanel();

  // --- Laporan: Monitoring Progress DO ---
  function renderMonitoring() {
    const tbody = $("#monitoringBody");
    tbody.innerHTML = "";
    daftarDO.forEach(([nomor, d]) => {
      const persen = persenProgres(d.perjalanan);
      const tr = document.createElement("tr");
      tr.className = "clickable-row";
      tr.innerHTML = `
        <td><a href="tracking.html?do=${encodeURIComponent(nomor)}" class="kode">${esc(nomor)}</a></td>
        <td>${esc(d.nama)}</td>
        <td>${esc(d.ekspedisi)}</td>
        <td>${badgeStatus(d.status)}</td>
        <td>
          <div class="progress" role="progressbar" aria-valuenow="${persen}" aria-valuemin="0" aria-valuemax="100" aria-label="Progres ${esc(nomor)}"><span style="width: 0%"></span></div>
          <small class="muted">${persen}% · ${esc(TAHAP[tahapTerjauh(d.perjalanan)]?.label || "Belum ada data")}</small>
        </td>
        <td>${esc(fmtWaktu(updateTerakhir(d.perjalanan)))}</td>`;
      tr.addEventListener("click", (e) => {
        if (!e.target.closest("a")) location.href = "tracking.html?do=" + encodeURIComponent(nomor);
      });
      tbody.appendChild(tr);
      // animasi: lebar bar diisi setelah elemen masuk DOM
      requestAnimationFrame(() => { tr.querySelector(".progress > span").style.width = persen + "%"; });
    });
  }

  // --- Laporan: Rekap Bahan Ajar ---
  function renderRekap() {
    const menipis = bahan.filter((b) => Number(b.stok) < BATAS_STOK_MENIPIS);
    $("#rekapStats").innerHTML = [
      ["Jumlah judul", bahan.length],
      ["Total eksemplar", fmtAngka.format(totalStok)],
      ["Rata-rata per judul", fmtAngka.format(Math.round(totalStok / (bahan.length || 1)))],
      ["Stok menipis", menipis.length]
    ].map(([l, v]) => `<div class="card stat"><div class="label">${l}</div><div class="value">${v}</div></div>`).join("");

    $$("[data-low-limit]").forEach((el) => (el.textContent = BATAS_STOK_MENIPIS));

    const maks = Math.max(...bahan.map((b) => Number(b.stok)), 1);
    const wadah = $("#rekapBars");
    wadah.innerHTML = "";
    [...bahan].sort((a, b) => b.stok - a.stok).forEach((b) => {
      const div = document.createElement("div");
      div.className = "bar-item";
      const rendah = Number(b.stok) < BATAS_STOK_MENIPIS;
      div.innerHTML = `
        <span title="${esc(b.kodeBarang)} · ${esc(b.kodeLokasi)}">${esc(b.namaBarang)}</span>
        <div class="progress"><span class="${rendah ? "low" : ""}" style="width: 0%"></span></div>
        <b class="num ${rendah ? "stok-low" : ""}" style="text-align: right;">${fmtAngka.format(b.stok)}</b>`;
      wadah.appendChild(div);
      requestAnimationFrame(() => { div.querySelector(".progress > span").style.width = (b.stok / maks) * 100 + "%"; });
    });

    // Kelompokkan per jenis barang
    const perJenis = bahan.reduce((acc, b) => {
      acc[b.jenisBarang] = acc[b.jenisBarang] || { judul: 0, stok: 0 };
      acc[b.jenisBarang].judul += 1;
      acc[b.jenisBarang].stok += Number(b.stok);
      return acc;
    }, {});
    $("#rekapJenis").innerHTML = Object.entries(perJenis).map(([jenis, r]) =>
      `<tr><td>${esc(jenis)}</td><td class="num">${r.judul}</td><td class="num">${fmtAngka.format(r.stok)}</td></tr>`
    ).join("");
  }

  // --- Histori Transaksi ---
  function renderHistori() {
    const input = $("#histSearch");
    const urut = [...daftarDO].sort(([, a], [, b]) => b.tanggalKirim.localeCompare(a.tanggalKirim));

    function isi() {
      const q = input.value.trim().toLowerCase();
      const hasil = urut.filter(([nomor, d]) => !q || nomor.includes(q) || d.nama.toLowerCase().includes(q));
      const tbody = $("#historiBody");
      tbody.innerHTML = hasil.length ? hasil.map(([nomor, d]) => `
        <tr>
          <td>${esc(fmtTanggal(d.tanggalKirim))}</td>
          <td><a class="kode" href="tracking.html?do=${encodeURIComponent(nomor)}">${esc(nomor)}</a></td>
          <td>${esc(d.nama)}</td>
          <td>${esc(namaPaket(d.paket))}</td>
          <td>${esc(d.ekspedisi)}</td>
          <td class="num">${esc(fmtRupiah.format(parseRupiah(d.total)))}</td>
          <td>${badgeStatus(d.status)}</td>
        </tr>`).join("")
        : `<tr class="empty-row"><td colspan="7" style="text-align: center; padding: 1.5rem;">Tidak ada transaksi yang cocok dengan "${esc(q)}".</td></tr>`;
      const total = hasil.reduce((s, [, d]) => s + parseRupiah(d.total), 0);
      $("#historiTotal").textContent = fmtRupiah.format(total);
    }
    input.addEventListener("input", isi);
    isi();
  }
}

/* ---------- 8. Halaman Tracking ---------- */
function halamanTracking() {
  const form = $("#trackForm");
  const input = $("#doInput");
  const hasil = $("#trackResult");
  pasangHapusErrorOtomatis(form);

  // Chip contoh nomor DO dan riwayat pencarian
  function renderChip(wadahId, label, daftar) {
    const wadah = $(wadahId);
    wadah.innerHTML = "";
    if (!daftar.length) return;
    const span = document.createElement("span");
    span.className = "muted";
    span.textContent = label;
    wadah.appendChild(span);
    daftar.forEach((nomor) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = nomor;
      chip.addEventListener("click", () => {
        input.value = nomor;
        cari(nomor);
      });
      wadah.appendChild(chip);
    });
  }
  renderChip("#doSuggest", "Nomor DO yang tersedia:", Object.keys(dataTracking));
  const renderRiwayat = () => renderChip("#doRecent", "Terakhir kamu cari:", store.get(KEY.doTerakhir, []));
  renderRiwayat();

  function validasi(nomor) {
    if (!nomor) return "Nomor DO belum diisi.";
    if (/\D/.test(nomor)) return "Nomor DO hanya berisi angka, tanpa huruf atau spasi.";
    if (nomor.length !== 10) return `Nomor DO harus 10 digit. Yang kamu ketik baru ${nomor.length} digit.`;
    return "";
  }

  function cari(nomor) {
    const pesan = validasi(nomor);
    if (!cekForm(form, [[input, pesan]])) {
      toast(pesan, "error");
      return;
    }

    const data = dataTracking[nomor];
    if (!data) {
      setError(input, "Nomor DO tidak ditemukan. Periksa lagi angka di bukti pemesanan.");
      hasil.innerHTML = `
        <div class="card empty-state">
          <div class="big" aria-hidden="true">🔍</div>
          <p><strong>DO ${esc(nomor)} tidak ada di sistem.</strong></p>
          <p class="small">Bisa jadi salah ketik satu digit, atau paket belum diinput oleh UPBJJ.</p>
        </div>`;
      toast(`DO ${nomor} tidak ditemukan.`, "error");
      return;
    }

    // Simpan ke riwayat (maksimal 5, tanpa duplikat)
    const riwayat = [nomor, ...store.get(KEY.doTerakhir, []).filter((n) => n !== nomor)].slice(0, 5);
    store.set(KEY.doTerakhir, riwayat);
    renderRiwayat();
    history.replaceState(null, "", "?do=" + nomor);

    renderHasil(nomor, data);
  }

  function renderHasil(nomor, d) {
    const idx = tahapTerjauh(d.perjalanan);
    const persen = persenProgres(d.perjalanan);
    const langkah = TAHAP.map((t, i) => {
      const kelas = i < idx ? "done" : i === idx ? (i === TAHAP.length - 1 ? "done" : "current") : "";
      return `<li class="${kelas}">${t.label}</li>`;
    }).join("");
    const timeline = d.perjalanan.map((p) => `
      <li>
        <time datetime="${esc(p.waktu.replace(" ", "T"))}">${esc(fmtWaktu(p.waktu))}</time>
        <p>${esc(p.keterangan)}</p>
      </li>`).join("");

    hasil.innerHTML = `
      <article class="card" aria-labelledby="hasilJudul">
        <div class="result-head">
          <div>
            <p class="muted small" style="margin: 0;">Nomor Delivery Order</p>
            <h2 class="do-no" id="hasilJudul">${esc(nomor)}</h2>
            <p style="margin: .3rem 0 0;">Mahasiswa: <strong>${esc(d.nama)}</strong></p>
          </div>
          <div style="text-align: right;">
            ${badgeStatus(d.status)}
            <p class="muted small" style="margin: .4rem 0 0;">Update terakhir ${esc(fmtWaktu(updateTerakhir(d.perjalanan)))}</p>
          </div>
        </div>

        <ol class="stepper" aria-label="Tahap pengiriman">${langkah}</ol>
        <div class="progress" role="progressbar" aria-valuenow="${persen}" aria-valuemin="0" aria-valuemax="100" aria-label="Progres pengiriman">
          <span style="width: 0%"></span>
        </div>
        <p class="small muted" style="margin: .4rem 0 1.4rem;">${persen}% perjalanan sudah dilalui</p>

        <dl class="detail-grid">
          <div><dt>Ekspedisi</dt><dd>${esc(d.ekspedisi)}</dd></div>
          <div><dt>Tanggal kirim</dt><dd>${esc(fmtTanggal(d.tanggalKirim))}</dd></div>
          <div><dt>Jenis paket</dt><dd>${esc(d.paket)}<br><small class="muted" style="font-weight: 400;">${esc(namaPaket(d.paket))}</small></dd></div>
          <div><dt>Total pembayaran</dt><dd>${esc(fmtRupiah.format(parseRupiah(d.total)))}</dd></div>
        </dl>

        <h3 style="margin-top: 1.6rem;">Riwayat perjalanan</h3>
        <ol class="timeline">${timeline}</ol>
      </article>`;

    requestAnimationFrame(() => { hasil.querySelector(".progress > span").style.width = persen + "%"; });
    hasil.scrollIntoView({ behavior: "smooth", block: "start" });
    toast(`Paket untuk ${d.nama} ditemukan.`);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    cari(input.value.trim());
  });

  // Dibuka dari tabel monitoring/histori: tracking.html?do=xxxx
  const dariUrl = new URLSearchParams(location.search).get("do");
  if (dariUrl) {
    input.value = dariUrl;
    cari(dariUrl.trim());
  }
}

/* ---------- 9. Halaman Stok ---------- */
function halamanStok() {
  let daftar = ambilBahanAjar();
  let mode = store.get(KEY.viewStok, "tabel");
  let kunciBaru = null; // baris yang baru ditambah, untuk efek sorot

  const cari = $("#stokSearch");
  const filter = $("#stokFilter");
  const urut = $("#stokSort");
  const kunci = (b) => b.kodeLokasi + "|" + b.kodeBarang;

  function isiOpsiJenis() {
    const pilihan = filter.value;
    const jenis = [...new Set(daftar.map((b) => b.jenisBarang))].sort();
    filter.innerHTML = `<option value="">Semua jenis</option>` + jenis.map((j) => `<option>${esc(j)}</option>`).join("");
    filter.value = jenis.includes(pilihan) ? pilihan : "";
  }

  function hasilFilter() {
    const q = cari.value.trim().toLowerCase();
    let data = daftar.filter((b) =>
      (!filter.value || b.jenisBarang === filter.value) &&
      (!q || [b.namaBarang, b.kodeBarang, b.kodeLokasi].some((x) => x.toLowerCase().includes(q)))
    );
    const pembanding = {
      "nama-asc": (a, b) => a.namaBarang.localeCompare(b.namaBarang, "id"),
      "stok-desc": (a, b) => b.stok - a.stok,
      "stok-asc": (a, b) => a.stok - b.stok
    }[urut.value];
    if (pembanding) data = [...data].sort(pembanding);
    return data;
  }

  function renderStatistik() {
    const total = daftar.reduce((s, b) => s + Number(b.stok), 0);
    const menipis = daftar.filter((b) => b.stok < BATAS_STOK_MENIPIS).length;
    $("#stokStats").innerHTML = `
      <div class="card stat"><div class="label">Judul</div><div class="value">${daftar.length}</div></div>
      <div class="card stat"><div class="label">Total eksemplar</div><div class="value">${fmtAngka.format(total)}</div></div>
      <div class="card stat"><div class="label">Stok &lt; ${BATAS_STOK_MENIPIS}</div><div class="value" style="color: ${menipis ? "var(--danger)" : "inherit"};">${menipis}</div></div>
      <div class="card stat"><div class="label">Lokasi</div><div class="value">${new Set(daftar.map((b) => b.kodeLokasi)).size}</div></div>`;
  }

  function badgeStok(stok) {
    return stok < BATAS_STOK_MENIPIS
      ? `<span class="stok-low">${fmtAngka.format(stok)}</span> <span class="badge badge-danger">menipis</span>`
      : fmtAngka.format(stok);
  }

  function renderTabel(data) {
    const tbody = $("#stokBody");
    tbody.innerHTML = "";
    if (!data.length) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="8">Tidak ada bahan ajar yang cocok dengan pencarian.</td></tr>`;
      return;
    }
    data.forEach((b) => {
      const tr = document.createElement("tr");
      if (kunci(b) === kunciBaru) tr.classList.add("row-new");
      tr.innerHTML = `
        <td><img class="thumb" width="46" height="62"></td>
        <td class="kode">${esc(b.kodeLokasi)}</td>
        <td class="kode">${esc(b.kodeBarang)}</td>
        <td>${esc(b.namaBarang)} ${b.baru ? '<span class="badge badge-clay">baru</span>' : ""}</td>
        <td>${esc(b.jenisBarang)}</td>
        <td class="num">${esc(b.edisi)}</td>
        <td class="num">${badgeStok(Number(b.stok))}</td>
        <td><div class="actions">
          <button type="button" class="btn btn-ghost btn-sm" data-aksi="detail">Detail</button>
          <button type="button" class="btn btn-ghost btn-sm" data-aksi="hapus" aria-label="Hapus ${esc(b.namaBarang)}">Hapus</button>
        </div></td>`;
      const img = tr.querySelector("img");
      pasangCover(img, b);
      img.addEventListener("click", () => tampilDetail(b));
      tr.querySelector('[data-aksi="detail"]').addEventListener("click", () => tampilDetail(b));
      tr.querySelector('[data-aksi="hapus"]').addEventListener("click", () => hapus(b));
      tbody.appendChild(tr);
    });
  }

  function renderKartu(data) {
    const wadah = $("#viewKartu");
    wadah.innerHTML = data.length ? "" : `<p class="muted">Tidak ada bahan ajar yang cocok dengan pencarian.</p>`;
    data.forEach((b) => {
      const art = document.createElement("article");
      art.className = "card book" + (kunci(b) === kunciBaru ? " row-new" : "");
      art.innerHTML = `
        <img>
        <div class="body">
          <span class="muted small kode">${esc(b.kodeBarang)} · ${esc(b.kodeLokasi)}</span>
          <h3>${esc(b.namaBarang)}</h3>
          <span class="small">${esc(b.jenisBarang)} · Edisi ${esc(b.edisi)}</span>
          <div class="meta">
            <span class="small">Stok: ${badgeStok(Number(b.stok))}</span>
            <button type="button" class="btn btn-ghost btn-sm">Detail</button>
          </div>
        </div>`;
      const img = art.querySelector("img");
      pasangCover(img, b);
      img.addEventListener("click", () => tampilDetail(b));
      art.querySelector("button").addEventListener("click", () => tampilDetail(b));
      wadah.appendChild(art);
    });
  }

  function render() {
    const data = hasilFilter();
    renderStatistik();
    $("#stokCaption").textContent = `Menampilkan ${data.length} dari ${daftar.length} judul. Klik cover untuk memperbesar.`;
    $("#viewTabel").hidden = mode !== "tabel";
    $("#viewKartu").hidden = mode !== "kartu";
    $$("[data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === mode)));
    if (mode === "tabel") renderTabel(data);
    else renderKartu(data);
    kunciBaru = null;
  }

  function tampilDetail(b) {
    const body = $("#detailBody");
    body.innerHTML = `
      <div class="detail-wrap">
        <img>
        <dl class="detail-list">
          <div><dt>Kode lokasi</dt><dd>${esc(b.kodeLokasi)}</dd></div>
          <div><dt>Kode barang</dt><dd>${esc(b.kodeBarang)}</dd></div>
          <div><dt>Nama barang</dt><dd>${esc(b.namaBarang)}</dd></div>
          <div><dt>Jenis barang</dt><dd>${esc(b.jenisBarang)}</dd></div>
          <div><dt>Edisi</dt><dd>${esc(b.edisi)}</dd></div>
          <div><dt>Stok</dt><dd>${badgeStok(Number(b.stok))}</dd></div>
        </dl>
      </div>`;
    pasangCover(body.querySelector("img"), b);
    $("#detailTitle").textContent = b.namaBarang;
    bukaModal("modalDetail");
  }

  async function hapus(b) {
    const ya = await konfirmasi(`"${b.namaBarang}" (${b.kodeBarang}) di lokasi ${b.kodeLokasi} akan dihapus dari daftar stok.`, {
      judul: "Hapus bahan ajar?", tombolYa: "Hapus"
    });
    if (!ya) return;
    daftar = daftar.filter((x) => kunci(x) !== kunci(b));
    simpanBahanAjar(daftar);
    isiOpsiJenis();
    render();
    toast(`${b.namaBarang} dihapus. Tekan "Kembalikan data awal" kalau ingin memulihkannya.`, "warn");
  }

  // Toolbar
  [cari, filter, urut].forEach((el) => el.addEventListener("input", render));
  $$("[data-view]").forEach((btn) => btn.addEventListener("click", () => {
    mode = btn.dataset.view;
    store.set(KEY.viewStok, mode);
    render();
  }));
  $("#btnReset").addEventListener("click", async () => {
    const ya = await konfirmasi("Semua tambahan dan penghapusan akan dibatalkan. Tabel kembali persis seperti isi data.js.", {
      judul: "Kembalikan data awal?", tombolYa: "Kembalikan"
    });
    if (!ya) return;
    store.remove(KEY.stok);
    daftar = ambilBahanAjar();
    isiOpsiJenis();
    render();
    toast("Data stok kembali seperti semula.");
  });

  // --- Form tambah stok ---
  const form = $("#tambahForm");
  const f = {
    lokasi: $("#fKodeLokasi"), barang: $("#fKodeBarang"), nama: $("#fNama"),
    jenis: $("#fJenis"), edisi: $("#fEdisi"), stok: $("#fStok"), cover: $("#fCover")
  };
  const preview = $("#fCoverPreview");
  let dataCover = "";
  pasangHapusErrorOtomatis(form);

  // Huruf kecil otomatis jadi kapital untuk kode
  [f.lokasi, f.barang].forEach((el) => el.addEventListener("input", () => {
    const pos = el.selectionStart;
    el.value = el.value.toUpperCase();
    el.setSelectionRange(pos, pos);
  }));

  // Cover diperkecil lewat <canvas> supaya muat di localStorage
  f.cover.addEventListener("change", () => {
    dataCover = "";
    preview.hidden = true;
    const file = f.cover.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(f.cover, "File harus berupa gambar (JPG atau PNG).");
      f.cover.value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError(f.cover, `Ukuran gambar ${(file.size / 1024 / 1024).toFixed(1)} MB, maksimal 2 MB.`);
      f.cover.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const tinggi = 400;
        const skala = Math.min(1, tinggi / img.height);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * skala);
        canvas.height = Math.round(img.height * skala);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        dataCover = canvas.toDataURL("image/jpeg", 0.8);
        preview.src = dataCover;
        preview.hidden = false;
      };
      img.onerror = () => setError(f.cover, "Gambar tidak bisa dibaca, coba file lain.");
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  form.addEventListener("reset", () => {
    dataCover = "";
    preview.hidden = true;
    bersihkanError(form);
  });
  $("#modalTambah").addEventListener("modal:tutup", () => bersihkanError(form));

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = {
      lokasi: f.lokasi.value.trim().toUpperCase(),
      barang: f.barang.value.trim().toUpperCase(),
      nama: f.nama.value.trim(),
      jenis: f.jenis.value,
      edisi: f.edisi.value.trim(),
      stok: f.stok.value.trim()
    };
    const dobel = daftar.some((b) => b.kodeLokasi === v.lokasi && b.kodeBarang === v.barang);

    const valid = cekForm(form, [
      [f.lokasi, !v.lokasi ? "Kode lokasi wajib diisi." : !/^[0-9A-Z]{4,10}$/.test(v.lokasi) ? "4-10 karakter huruf/angka tanpa spasi." : ""],
      [f.barang, !v.barang ? "Kode barang wajib diisi." : !/^[A-Z]{4}\d{4}$/.test(v.barang) ? "Format: 4 huruf + 4 angka, misal MSIM4203." : dobel ? `${v.barang} sudah tercatat di lokasi ${v.lokasi}.` : ""],
      [f.nama, !v.nama ? "Nama barang wajib diisi." : v.nama.length < 3 ? "Nama barang terlalu pendek." : ""],
      [f.jenis, !v.jenis ? "Pilih jenis barang." : ""],
      [f.edisi, !v.edisi ? "Isi edisi." : !/^\d+$/.test(v.edisi) || +v.edisi < 1 || +v.edisi > 20 ? "Edisi 1 sampai 20." : ""],
      [f.stok, v.stok === "" ? "Isi jumlah stok." : !/^\d+$/.test(v.stok) ? "Stok harus bilangan bulat ≥ 0." : +v.stok > 100000 ? "Stok terlalu besar, cek lagi." : ""]
    ]);
    if (!valid) {
      toast("Masih ada isian yang perlu diperbaiki.", "error");
      return;
    }

    const item = {
      kodeLokasi: v.lokasi,
      kodeBarang: v.barang,
      namaBarang: v.nama,
      jenisBarang: v.jenis,
      edisi: String(Number(v.edisi)),
      stok: Number(v.stok),
      cover: dataCover,
      baru: true
    };
    daftar.push(item);
    if (!simpanBahanAjar(daftar)) {
      toast("Baris masuk ke tabel, tapi browser menolak menyimpannya. Data hilang kalau halaman dimuat ulang.", "warn");
    }

    // Kosongkan filter supaya baris baru pasti kelihatan
    cari.value = "";
    urut.value = "";
    isiOpsiJenis();
    filter.value = "";
    kunciBaru = kunci(item);
    render();

    tutupModal("modalTambah");
    form.reset();
    toast(`${item.namaBarang} (${item.stok} eksemplar) ditambahkan ke ${item.kodeLokasi}.`);
    const sorot = $(".row-new");
    if (sorot) sorot.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  isiOpsiJenis();
  render();
}

/* ---------- 10. Titik masuk ---------- */
document.addEventListener("DOMContentLoaded", () => {
  initTema();
  initModal();

  if (typeof dataPengguna === "undefined" || typeof dataBahanAjar === "undefined" || typeof dataTracking === "undefined") {
    toast("js/data.js gagal dimuat. Pastikan file ada dan tidak berisi tag <script>.", "error");
    return;
  }

  const halaman = document.body.dataset.page;
  const user = store.get(KEY.session, null, "session");

  if (halaman === "login") {
    if (user) {
      location.replace("dashboard.html");
      return;
    }
    halamanLogin();
    return;
  }

  // Halaman selain login wajib sudah login
  if (!user) {
    location.replace("index.html");
    return;
  }
  initShell(user);
  if (halaman === "dashboard") halamanDashboard(user);
  if (halaman === "tracking") halamanTracking();
  if (halaman === "stok") halamanStok();
});
