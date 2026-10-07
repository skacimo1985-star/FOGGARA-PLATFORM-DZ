import rawWilayas from "../../reference/wilayas.json";

export type Wilaya = {
  code: string;
  ar: string;
  fr: string;
  en: string;
};

export const WILAYAS: Wilaya[] = rawWilayas;
