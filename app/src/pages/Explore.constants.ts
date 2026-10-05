import { Droplets, Zap, Wheat, Leaf, HeartPulse } from "lucide-react";

export const WEFEH_DOMAINS = [
  { key: "water", icon: Droplets, operational: true },
  { key: "energy", icon: Zap, operational: false },
  { key: "food", icon: Wheat, operational: false },
  { key: "ecosystem", icon: Leaf, operational: false },
  { key: "health", icon: HeartPulse, operational: false },
] as const;
