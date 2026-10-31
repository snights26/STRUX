import { parseProject, serializeProject } from '../model/serialization';
import type { Project } from '../model/types';

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** Lazily loaded so the same React source remains usable in a normal browser. */
async function nativeFileApis() {
  const [dialog, filesystem] = await Promise.all([
    import('@tauri-apps/plugin-dialog'),
    import('@tauri-apps/plugin-fs'),
  ]);
  return { open: dialog.open, save: dialog.save, readTextFile: filesystem.readTextFile, writeTextFile: filesystem.writeTextFile };
}

export async function saveProjectFile(project: Project): Promise<string | null> {
  const content = serializeProject(project);
  const suggestedName = `${project.name.replace(/[^a-z0-9-_]+/gi, '_') || 'strux-project'}.strux.json`;
  if (isTauri()) {
    const { save, writeTextFile } = await nativeFileApis();
    const path = await save({ defaultPath: suggestedName, filters: [{ name: 'STRUX Project', extensions: ['json'] }] });
    if (!path) return null;
    await writeTextFile(path, content);
    return path;
  }
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = suggestedName; link.click();
  URL.revokeObjectURL(url);
  return suggestedName;
}

export async function openProjectFile(): Promise<{ project?: Project; errors: string[]; path?: string }> {
  if (isTauri()) {
    const { open, readTextFile } = await nativeFileApis();
    const path = await open({ multiple: false, filters: [{ name: 'STRUX Project', extensions: ['json'] }] });
    if (!path || Array.isArray(path)) return { errors: [] };
    return { ...parseProject(await readTextFile(path)), path };
  }
  return { errors: ['Use the Import control when running in a browser.'] };
}

export async function importProjectFromFile(file: File): Promise<{ project?: Project; errors: string[] }> {
  return parseProject(await file.text());
}
