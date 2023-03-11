import {Config} from "@namuol/tailwindcss/types/config";

export type GenerateTypes = {
  (theme: Config["theme"]): void;
};

export declare const generateTypes: GenerateTypes;
