import type {Config} from "@namuol/tailwindcss/types/config";
import type {DefaultTheme} from "@namuol/tailwindcss/types/generated/default-theme";

export type DefaultScreens = keyof DefaultTheme["screens"];

export type WithTV = {
  <C extends Config = {}>(tvConfig: Config): C;
};

export declare const withTV: WithTV;

export type TVTransformer = {
  (content: string, file?: string, screens?: string[] | DefaultScreens[]): string;
};

export declare const tvTransformer: TVTransformer;
