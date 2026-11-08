import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  createStaticSource,
  type SearchableItem,
} from "@astryxdesign/core/Typeahead";

export interface AstryxCommandMeta {
  group: string;
  description: string;
  keywords: string[];
}

export type AstryxCommandItem = SearchableItem<AstryxCommandMeta>;

export const ASTRYX_COMMAND_ITEMS: AstryxCommandItem[] = [
  {
    id: "theme:toggle",
    label: "Ganti Mode Tampilan (Terang / Gelap)",
    auxiliaryData: {
      group: "Preferensi & Sistem",
      description: "Ubah tema warna antara Light Mode dan Dark Mode Astryx",
      keywords: ["dark", "light", "tema", "gelap", "terang", "mode"],
    },
  },
  {
    id: "theme:settings",
    label: "Pengaturan Tema & Desain Astryx",
    auxiliaryData: {
      group: "Preferensi & Sistem",
      description: "Buka panel konfigurasi tampilan Meta Astryx Design System",
      keywords: ["settings", "pengaturan", "astryx", "preferensi"],
    },
  },
  {
    id: "guru:absen",
    label: "Portal Guru: Beranda & Presensi Kamera",
    auxiliaryData: {
      group: "Portal Guru & BK",
      description: "Buka halaman utama absen kamera GPS dan status harian",
      keywords: ["beranda", "absen", "kamera", "guru"],
    },
  },
  {
    id: "guru:bk-radar",
    label: "Guru BK: Radar Deteksi Dini Presensi",
    auxiliaryData: {
      group: "Portal Guru & BK",
      description: "Pantau siswa berstatus Kritis, Waspada, dan Pantauan",
      keywords: ["bk", "radar", "kritis", "waspada", "konseling"],
    },
  },
  {
    id: "guru:bk-diagram",
    label: "Guru BK: Diagram & Agregasi Kehadiran Kelas",
    auxiliaryData: {
      group: "Portal Guru & BK",
      description: "Pantau komposisi Hadir, Telat, Izin, Sakit, dan Alfa per kelas",
      keywords: ["bk", "diagram", "kelas", "rekap", "rombel"],
    },
  },
  {
    id: "guru:bk-asuh",
    label: "Guru BK: Direktori Data Asuh Siswa",
    auxiliaryData: {
      group: "Portal Guru & BK",
      description: "Daftar siswa yatim, domisili luar, dan asal kepulauan",
      keywords: ["bk", "yatim", "domisili", "kepulauan", "asuh"],
    },
  },
  {
    id: "guru:bk-jurnal",
    label: "Guru BK: Jurnal Layanan Bimbingan & Konseling",
    auxiliaryData: {
      group: "Portal Guru & BK",
      description: "Catatan pembinaan, panggilan orang tua, dan home visit",
      keywords: ["bk", "jurnal", "konseling", "pembinaan"],
    },
  },
  {
    id: "guru:riwayat",
    label: "Portal Guru: Riwayat Kehadiran Saya",
    auxiliaryData: {
      group: "Portal Guru & BK",
      description: "Lihat riwayat log presensi harian guru",
      keywords: ["riwayat", "log", "histori", "guru"],
    },
  },
  {
    id: "guru:honor",
    label: "Portal Guru: Rincian & Estimasi Honor",
    auxiliaryData: {
      group: "Portal Guru & BK",
      description: "Lihat rekap sesi mengajar dan rincian honor bulanan",
      keywords: ["honor", "gaji", "insentif", "guru"],
    },
  },
  {
    id: "admin:dashboard",
    label: "Portal Admin: Dashboard & Analitik",
    auxiliaryData: {
      group: "Portal Admin",
      description: "Ringkasan statistik kehadiran guru dan siswa",
      keywords: ["admin", "dashboard", "statistik"],
    },
  },
  {
    id: "admin:absensi",
    label: "Portal Admin: Log & Rekap Presensi Guru",
    auxiliaryData: {
      group: "Portal Admin",
      description: "Kelola data absensi harian dan rekap bulanan guru",
      keywords: ["admin", "presensi", "absensi", "rekap"],
    },
  },
  {
    id: "admin:siswa",
    label: "Portal Admin: Direktori & Presensi Siswa",
    auxiliaryData: {
      group: "Portal Admin",
      description: "Kelola data induk siswa dan rekapitulasi presensi kelas",
      keywords: ["admin", "siswa", "kelas", "rombel"],
    },
  },
  {
    id: "admin:jadwal",
    label: "Portal Admin: Jadwal Pelajaran & Master Mapel",
    auxiliaryData: {
      group: "Portal Admin",
      description: "Atur jadwal mengajar mingguan dan daftar mata pelajaran",
      keywords: ["admin", "jadwal", "mapel", "pelajaran"],
    },
  },
  {
    id: "admin:users",
    label: "Portal Admin: Manajemen Akun Guru & Staf",
    auxiliaryData: {
      group: "Portal Admin",
      description: "Kelola akun pengguna, role, dan tarif honor",
      keywords: ["admin", "akun", "user", "guru", "staf"],
    },
  },
  {
    id: "admin:pengaturan",
    label: "Portal Admin: Pengaturan & Geofence",
    auxiliaryData: {
      group: "Portal Admin",
      description: "Konfigurasi titik koordinat GPS madrasah dan jam presensi",
      keywords: ["admin", "pengaturan", "geofence", "gps", "lokasi"],
    },
  },
  {
    id: "kepala:dashboard",
    label: "Portal Kepala: Dashboard Eksekutif",
    auxiliaryData: {
      group: "Portal Kepala Madrasah",
      description: "Ringkasan eksekutif kehadiran guru dan siswa",
      keywords: ["kepala", "dashboard", "eksekutif"],
    },
  },
  {
    id: "kepala:siswa",
    label: "Portal Kepala: Rekap & Diagram Kehadiran Siswa",
    auxiliaryData: {
      group: "Portal Kepala Madrasah",
      description: "Monitoring agregasi kehadiran seluruh rombel",
      keywords: ["kepala", "siswa", "diagram", "rekap"],
    },
  },
  {
    id: "kepala:honor",
    label: "Portal Kepala: Rekap Honorarium Guru",
    auxiliaryData: {
      group: "Portal Kepala Madrasah",
      description: "Laporan rekapitulasi honor mengajar bulanan",
      keywords: ["kepala", "honor", "gaji", "laporan"],
    },
  },
  {
    id: "kepala:izin",
    label: "Portal Kepala: Persetujuan Izin & Guru Pengganti",
    auxiliaryData: {
      group: "Portal Kepala Madrasah",
      description: "Verifikasi pengajuan izin/sakit guru dan penugasan pengganti",
      keywords: ["kepala", "izin", "sakit", "pengganti", "approval"],
    },
  },
];

export const astryxCommandSource = createStaticSource(ASTRYX_COMMAND_ITEMS, {
  keywords: (item) => [
    item.auxiliaryData?.group ?? "",
    item.auxiliaryData?.description ?? "",
    ...(item.auxiliaryData?.keywords ?? []),
  ],
});

type GlobalAppWindow = Window & {
  toggleTheme?: () => void;
  applyAstryxThemeMode?: (mode: "light" | "dark") => void;
  gantiTab?: (tabId: string) => void;
  gantiTabGuru?: (tabId: string) => void;
  gantiSubTabBK?: (subTab: string) => void;
  openAstryxCommandPalette?: () => void;
  openAstryxSettings?: () => void;
};

export function executeAstryxCommand(
  commandId: string,
  onOpenSettings: () => void,
): void {
  if (typeof window === "undefined") return;
  const win = window as GlobalAppWindow;

  if (commandId === "theme:toggle") {
    if (typeof win.toggleTheme === "function") {
      win.toggleTheme();
    } else {
      const next = document.documentElement.classList.contains("dark")
        ? "light"
        : "dark";
      setDocumentThemeMode(next);
    }
    return;
  }

  if (commandId === "theme:settings") {
    onOpenSettings();
    return;
  }

  if (commandId.startsWith("guru:")) {
    const action = commandId.slice("guru:".length);
    if (action.startsWith("bk-")) {
      const sub = action.slice("bk-".length);
      if (typeof win.gantiTabGuru === "function") {
        win.gantiTabGuru("bk");
      }
      if (typeof win.gantiSubTabBK === "function") {
        win.gantiSubTabBK(sub);
      }
      return;
    }
    if (typeof win.gantiTabGuru === "function") {
      win.gantiTabGuru(action);
    }
    return;
  }

  if (commandId.startsWith("admin:") || commandId.startsWith("kepala:")) {
    const tabId = commandId.replace(":", "-");
    if (typeof win.gantiTab === "function") {
      win.gantiTab(tabId);
    }
  }
}

export function setDocumentThemeMode(mode: "light" | "dark"): void {
  if (typeof document === "undefined") return;
  const isDark = mode === "dark";
  document.documentElement.classList.toggle("dark", isDark);
  document.documentElement.setAttribute("data-theme", mode);
  document.documentElement.setAttribute("data-astryx-theme", "neutral");
  try {
    localStorage.setItem("theme", mode);
  } catch {
    // ignore storage errors
  }
  try {
    window.dispatchEvent(
      new CustomEvent("astryx-theme-change", { detail: { mode } }),
    );
  } catch {
    // ignore event errors
  }
}

function readDocumentThemeMode(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  try {
    const stored = localStorage.getItem("theme");
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // ignore
  }
  return document.documentElement.classList.contains("dark")
    ? "dark"
    : "light";
}

function subscribeThemeMode(onStoreChange: () => void): () => void {
  if (typeof document === "undefined") return () => {};

  const initial = readDocumentThemeMode();
  document.documentElement.classList.toggle("dark", initial === "dark");
  document.documentElement.setAttribute("data-theme", initial);
  document.documentElement.setAttribute("data-astryx-theme", "neutral");

  const onCustomChange = () => {
    onStoreChange();
  };

  const observer = new MutationObserver(() => {
    const isDark = document.documentElement.classList.contains("dark");
    const next = isDark ? "dark" : "light";
    if (document.documentElement.getAttribute("data-theme") !== next) {
      document.documentElement.setAttribute("data-theme", next);
    }
    onStoreChange();
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  window.addEventListener("astryx-theme-change", onCustomChange);

  return () => {
    observer.disconnect();
    window.removeEventListener("astryx-theme-change", onCustomChange);
  };
}

export function useAstryxThemeSync(): {
  mode: "light" | "dark";
  setMode: (next: "light" | "dark") => void;
} {
  const mode = useSyncExternalStore<"light" | "dark">(
    subscribeThemeMode,
    readDocumentThemeMode,
    (): "light" | "dark" => "light",
  );

  const setMode = useCallback((next: "light" | "dark") => {
    setDocumentThemeMode(next);
  }, []);

  return { mode, setMode };
}

export function useAstryxGlobalShortcuts(
  onOpenPalette: () => void,
  onOpenSettings: () => void,
): void {
  useEffect(() => {
    const win = window as GlobalAppWindow;
    win.openAstryxCommandPalette = onOpenPalette;
    win.openAstryxSettings = onOpenSettings;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenPalette();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onOpenPalette, onOpenSettings]);
}

export function useMountAppBody(html: string): (node: HTMLElement | null) => void {
  return useCallback(
    (node: HTMLElement | null) => {
      if (!node) return;
      let container = node.querySelector<HTMLElement>("#app-root-container");
      if (!container) {
        container = document.createElement("div");
        container.id = "app-root-container";
        container.setAttribute("data-astryx-mounted", "true");
        container.innerHTML = html;
        node.appendChild(container);
      }
      const win = window as GlobalAppWindow & {
        __appInitialized?: boolean;
        initApp?: () => void;
      };
      if (typeof win.initApp === "function") {
        win.initApp();
      }
    },
    [html],
  );
}
