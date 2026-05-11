import { KEY_GROUP_SIZE } from "../constants";

// ─── API key helpers ─────────────────────────────────────────────────────────

export const normalizeKeyInputs = (inputs: string[]): string[] => {
  const next = [...inputs];

  while (
    next.length > 1 &&
    next[next.length - 1] === "" &&
    next[next.length - 2] === ""
  ) {
    next.pop();
  }

  if (next.every((value) => value === "")) {
    return [""];
  }

  if (next[next.length - 1] !== "") {
    next.push("");
  }

  return next;
};

export const getUsableApiKeys = (inputs: string[]): string[] =>
  inputs.map((key) => key.trim()).filter(Boolean);

export const groupKeysByWord = (keys: string[]): string[][] => {
  const groups: string[][] = [];

  for (let i = 0; i < keys.length; i += KEY_GROUP_SIZE) {
    groups.push(keys.slice(i, i + KEY_GROUP_SIZE));
  }

  return groups;
};
