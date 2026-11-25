export type ShopSlot = "banner" | "frame" | "avatar" | "title";
export type Rarity = "free" | "common" | "rare" | "epic" | "legendary";

export interface ShopItem {
  id: string;
  slot: ShopSlot;
  name: string;
  price: number;
  rarity: Rarity;
  emoji?: string;
  titleText?: string;
  desc: string;
}

export const RARITY_META: Record<Rarity, { label: string; color: string }> = {
  free: { label: "Bepul", color: "#94a3b8" },
  common: { label: "Oddiy", color: "#38bdf8" },
  rare: { label: "Noyob", color: "#10b981" },
  epic: { label: "Epik", color: "#a855f7" },
  legendary: { label: "Afsonaviy", color: "#f59e0b" },
};

export const WEEKLY_REWARDS = [5, 5, 8, 10, 12, 15, 30];

export const SHOP_CATALOG: ShopItem[] = [
  // BANNERS
  { id: "default_navy", slot: "banner", name: "Bilim Navy", price: 0, rarity: "free", desc: "Asosiy klassik ko‘k-zumrad fon" },
  { id: "cyber_neon", slot: "banner", name: "Cyber Neon", price: 120, rarity: "common", desc: "Kiber-tarmoq va neon chiziqlar" },
  { id: "emerald_matrix", slot: "banner", name: "Emerald Matrix", price: 150, rarity: "rare", desc: "Dasturchilar uchun yashil matritsa" },
  { id: "solar_flare", slot: "banner", name: "Olovli Ajdaho", price: 220, rarity: "epic", desc: "Alanga va to‘q qirmizi jang foni" },
  { id: "cosmic_aurora", slot: "banner", name: "Tungi Kosmos", price: 300, rarity: "epic", desc: "Yulduzli osmon va qutb yog‘dusi" },
  { id: "royal_gold", slot: "banner", name: "Oltin Afsona", price: 450, rarity: "legendary", desc: "Chempionlar uchun qirollik oltin banneri" },

  // AVATAR FRAMES
  { id: "none", slot: "frame", name: "Oddiy ramka", price: 0, rarity: "free", desc: "Ramkasiz toza ko‘rinish" },
  { id: "emerald_glow", slot: "frame", name: "Zumrad Nur", price: 80, rarity: "common", desc: "Yorqin yashil nurlanuvchi halqa" },
  { id: "cyber_cyan", slot: "frame", name: "Kiber Neon", price: 140, rarity: "rare", desc: "Harakatlanuvchi moviy-binafsha neon" },
  { id: "fire_ring", slot: "frame", name: "Olovli Halqa", price: 200, rarity: "epic", desc: "Yonib turuvchi qizg‘ish-oltin ramka" },
  { id: "galaxy_spin", slot: "frame", name: "Galaktika Aylanasi", price: 320, rarity: "epic", desc: "Aylanuvchi kamalak-kosmos ramkasi" },
  { id: "gold_crown", slot: "frame", name: "Oltin Toj", price: 500, rarity: "legendary", desc: "Afsonaviy oltin nurlanuvchi chempion ramkasi" },

  // AVATARS
  { id: "initials", slot: "avatar", name: "Ism harflari", price: 0, rarity: "free", emoji: "AB", desc: "Standart bosh harflar" },
  { id: "coder", slot: "avatar", name: "Dasturchi", price: 60, rarity: "common", emoji: "💻", desc: "Kod yozuvchi ustoz shogirdi" },
  { id: "astronaut", slot: "avatar", name: "Kosmonavt", price: 90, rarity: "common", emoji: "🧑‍🚀", desc: "Bilim koinotini zabt etuvchi" },
  { id: "ninja", slot: "avatar", name: "Kiber-Ninja", price: 120, rarity: "rare", emoji: "🥷", desc: "Tezkor va aniq javob ustasi" },
  { id: "robot", slot: "avatar", name: "AI Robot", price: 150, rarity: "rare", emoji: "🤖", desc: "Sun’iy intellekt darajasidagi zakovat" },
  { id: "lion", slot: "avatar", name: "Sher", price: 180, rarity: "rare", emoji: "🦁", desc: "Guruhning jasur yetakchisi" },
  { id: "wizard", slot: "avatar", name: "Bilim Sehrgari", price: 220, rarity: "epic", emoji: "🧙‍♂️", desc: "Murakkab masalalar sehrgari" },
  { id: "dragon", slot: "avatar", name: "Ajdaho", price: 300, rarity: "epic", emoji: "🐉", desc: "Yengilmas kuch va donolik ramzi" },
  { id: "crown", slot: "avatar", name: "Chempion Toji", price: 400, rarity: "legendary", emoji: "👑", desc: "Eng kuchli o‘quvchilar belgisi" },

  // TITLES
  { id: "", slot: "title", name: "Unvonsiz", price: 0, rarity: "free", titleText: "", desc: "Unvon ko‘rsatilmaydi" },
  { id: "kod_ustasi", slot: "title", name: "Kod Ustasi", price: 100, rarity: "common", titleText: "⚡ Kod Ustasi", desc: "IT va mantiq bilimdonlari uchun" },
  { id: "snayper", slot: "title", name: "Test Snayperi", price: 140, rarity: "rare", titleText: "🎯 Test Snayperi", desc: "Aniq nishonga oluvchi testchi" },
  { id: "olimpiadachi", slot: "title", name: "Olimpiada Yulduzi", price: 220, rarity: "epic", titleText: "🏆 Olimpiada Yulduzi", desc: "Musobaqalar g‘olibi unvoni" },
  { id: "kiber_qahramon", slot: "title", name: "Kiber Qahramon", price: 280, rarity: "epic", titleText: "🛡️ Kiber Qahramon", desc: "Raqamli dunyo himoyachisi" },
  { id: "afsona", slot: "title", name: "Bilim Afsonasi", price: 450, rarity: "legendary", titleText: "👑 Bilim Afsonasi", desc: "Eng yuksak afsonaviy unvon" },
];

export function avatarDisplay(avatarId: string, fullName: string): string {
  const found = SHOP_CATALOG.find((i) => i.slot === "avatar" && i.id === avatarId);
  if (found && found.id !== "initials" && found.emoji) return found.emoji;
  const parts = String(fullName || "?").trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

export function titleDisplay(titleId: string): string {
  const found = SHOP_CATALOG.find((i) => i.slot === "title" && i.id === titleId);
  return found?.titleText || "";
}
