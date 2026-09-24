import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cwd } from "node:process";
import { deserialize, serialize } from "node:v8";

const CACHE_DIR = ".analytics";

export async function cache<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const path = join(cwd(), CACHE_DIR, `${key}.bin`);
  if (existsSync(path)) return deserialize(await readFile(path)) as T;
  const value = await fn();
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(path, serialize(value));
  return value;
}
