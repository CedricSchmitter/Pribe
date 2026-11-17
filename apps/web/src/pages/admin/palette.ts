export const AVATAR_EMOJIS = [
  '🦊', '🐙', '🦄', '🐸', '🐼', '🦁', '🐯', '🐨', '🐵', '🦉',
  '🐧', '🦖', '🐳', '🦩', '🐝', '🦔', '🐢', '🦜', '🐌', '🦀',
  '🍕', '🌮', '🍩', '🥨', '🍓', '🥑', '🌶️', '🍄', '🌵', '🌻',
  '🚀', '🎸', '🎩', '👾', '🤖', '👻', '💎', '🔥', '⚡', '🌈',
] as const;

export const AVATAR_COLORS = [
  '#ff5a5f', '#ff8a3d', '#ffc53d', '#9be15d', '#2fd18b', '#19c3c0',
  '#3da9fc', '#5468ff', '#8b5cf6', '#d946ef', '#ff4fa3', '#a16207',
  '#64748b', '#0f766e', '#be123c', '#1e293b',
] as const;

export function randomOf<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]!;
}
