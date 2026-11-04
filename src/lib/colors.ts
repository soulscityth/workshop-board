export const COLORS: { key: string; bg: string; label: string }[] = [
  { key: "white", bg: "#ffffff", label: "ขาว" },
  { key: "yellow", bg: "#fff4b8", label: "เหลือง" },
  { key: "orange", bg: "#ffdcbf", label: "ส้ม" },
  { key: "pink", bg: "#ffd6e4", label: "ชมพู" },
  { key: "purple", bg: "#e6dcff", label: "ม่วง" },
  { key: "blue", bg: "#d4e9ff", label: "ฟ้า" },
  { key: "green", bg: "#d5f5dc", label: "เขียว" },
  { key: "gray", bg: "#e9e9ee", label: "เทา" },
];
export const COLOR_KEYS = new Set(COLORS.map((c) => c.key));
export const colorBg = (k: string) => COLORS.find((c) => c.key === k)?.bg ?? "#ffffff";
