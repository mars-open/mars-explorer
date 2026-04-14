import { Button, Text, UNSTABLE_Toast as Toast, UNSTABLE_ToastRegion as ToastRegion } from 'react-aria-components';
import './AppToast.css';
import { appToastQueue } from './appToastBus';

export function AppToastRegion() {
  return (
    <ToastRegion queue={appToastQueue} className="app-toast-region">
      {({ toast }) => {
        const content = toast.content;
        return (
          <Toast toast={toast} className={`app-toast app-toast--${content.level}`}>
            <div className="app-toast-content">
              <Text slot="title" className="app-toast-title">{content.title}</Text>
              {content.description ? (
                <Text slot="description" className="app-toast-description">{content.description}</Text>
              ) : null}
            </div>
            <Button slot="close" className="app-toast-close" aria-label="Dismiss notification">
              Close
            </Button>
          </Toast>
        );
      }}
    </ToastRegion>
  );
}
