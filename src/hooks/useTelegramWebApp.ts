import { useEffect, useState } from 'react';

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        ready(): void;
        close(): void;
        expand(): void;
        MainButton: {
          text: string;
          color: string;
          textColor: string;
          isVisible: boolean;
          isActive: boolean;
          show(): void;
          hide(): void;
          enable(): void;
          disable(): void;
          onClick(callback: () => void): void;
          offClick(callback: () => void): void;
          showProgress(leaveActive: boolean): void;
          hideProgress(): void;
        };
        BackButton: {
          isVisible: boolean;
          show(): void;
          hide(): void;
          onClick(callback: () => void): void;
          offClick(callback: () => void): void;
        };
        onEvent(eventType: string, callback: () => void): void;
        offEvent(eventType: string, callback: () => void): void;
        sendData(data: string): void;
        enableClosingConfirmation(): void;
        disableClosingConfirmation(): void;
        setHeaderColor(color: string): void;
        setBackgroundColor(color: string): void;
        themeParams: {
          bg_color: string;
          text_color: string;
          hint_color: string;
          link_color: string;
          button_color: string;
          button_text_color: string;
        };
        isExpanded: boolean;
        viewportHeight: number;
        viewportStableHeight: number;
        colorScheme: 'light' | 'dark';
      };
    };
  }
}

type TelegramWebApp = NonNullable<Window['Telegram']>['WebApp'];

export const useTelegramWebApp = () => {
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const telegram = window.Telegram?.WebApp;
    
    if (telegram) {
      // WebApp'i hazırla
      telegram.ready();
      
      // Tema renklerini ayarla
      telegram.setHeaderColor('#1c1c1c');
      telegram.setBackgroundColor('#1c1c1c');
      
      // Kapatma onayını aktifleştir
      telegram.enableClosingConfirmation();
      
      // WebApp state'ini güncelle
      setWebApp(telegram);
      setIsReady(true);

      // Cleanup
      return () => {
        telegram.disableClosingConfirmation();
      };
    }
  }, []);

  const showMainButton = (text: string, onClick: () => void) => {
    if (webApp?.MainButton) {
      webApp.MainButton.text = text;
      webApp.MainButton.onClick(onClick);
      webApp.MainButton.show();
    }
  };

  const hideMainButton = () => {
    webApp?.MainButton?.hide();
  };

  const showLoadingMainButton = () => {
    webApp?.MainButton?.showProgress(false);
  };

  const hideLoadingMainButton = () => {
    webApp?.MainButton?.hideProgress();
  };

  const closeApp = () => {
    webApp?.close();
  };

  const expandApp = () => {
    webApp?.expand();
  };

  return {
    webApp,
    isReady,
    showMainButton,
    hideMainButton,
    showLoadingMainButton,
    hideLoadingMainButton,
    closeApp,
    expandApp,
    themeParams: webApp?.themeParams,
    colorScheme: webApp?.colorScheme
  };
}; 