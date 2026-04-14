import { UNSTABLE_ToastQueue as ToastQueue } from 'react-aria-components';

export type AppToastLevel = 'info' | 'success' | 'warning' | 'error';

export interface AppToastOptions {
  title: string;
  description?: string;
  level?: AppToastLevel;
  timeout?: number;
}

export interface AppToastContent {
  title: string;
  description?: string;
  level: AppToastLevel;
}

export const appToastQueue = new ToastQueue<AppToastContent>({ maxVisibleToasts: 5 });

function logToast(options: AppToastOptions, level: AppToastLevel): void {
  const message = options.description ? `${options.title}: ${options.description}` : options.title;
  if (level === 'error') {
    console.error(message);
  } else if (level === 'warning') {
    console.warn(message);
  } else {
    console.log(message);
  }
}

export function notifyAppToast(options: AppToastOptions): void {
  const level = options.level ?? 'info';
  logToast(options, level);
  appToastQueue.add(
    {
      title: options.title,
      description: options.description,
      level
    },
    { timeout: options.timeout ?? 10000 }
  );
}
