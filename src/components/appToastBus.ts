import { UNSTABLE_ToastQueue as ToastQueue } from 'react-aria-components';

export type AppToastLevel = 'info' | 'success' | 'warning' | 'error';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppToastDescription = any;

export interface AppToastOptions {
  title: string;
  description?: AppToastDescription;
  level?: AppToastLevel;
  timeout?: number;
}

export interface AppToastContent {
  title: string;
  description?: string;
  level: AppToastLevel;
}

export const appToastQueue = new ToastQueue<AppToastContent>({ maxVisibleToasts: 5 });

function normalizeDescription(description?: AppToastDescription): string | undefined {
  if (description === undefined) return undefined;
  if (description instanceof Error) return `${description.name}: ${description.message}`;
  return description;
}

function logToast(options: AppToastOptions, level: AppToastLevel): void {
  const description = normalizeDescription(options.description);
  const message = description ? `${options.title}: ${description}` : options.title;
  if (level === 'error') {
    console.error(options.description.stack ?? message);
  } else if (level === 'warning') {
    console.warn(message);
  } else {
    console.log(message);
  }
}

export function notifyAppToast(options: AppToastOptions): void {
  const level = options.level ?? 'info';
  const description = normalizeDescription(options.description);
  logToast(options, level);
  appToastQueue.add(
    {
      title: options.title,
      description,
      level
    },
    { timeout: options.timeout ?? 5000 }
  );
}
