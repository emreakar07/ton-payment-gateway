import React from 'react';
import { TonConnectButton, TonConnectUIProvider, THEME } from '@tonconnect/ui-react';
import { TxForm } from '@components/TxForm/TxForm';
import { useTelegramWebApp } from '@/hooks/useTelegramWebApp';
import './App.scss';

const manifestUrl = 'https://ton-payment-gateway.vercel.app/tonconnect-manifest.json';

function App() {
  const { colorScheme } = useTelegramWebApp();

  // Tarayıcı kapandığında cüzdan bağlantısını kapat
  const handleBeforeUnload = () => {
    // LocalStorage'dan TonConnect durumunu temizle
    localStorage.removeItem('tonconnect-ui');
    localStorage.removeItem('tonconnect-ui-options');
  };

  // BeforeUnload event listener'ı ekle
  window.addEventListener('beforeunload', handleBeforeUnload);

  return (
    <TonConnectUIProvider 
      manifestUrl={manifestUrl} 
      uiPreferences={{ 
        theme: colorScheme === 'dark' ? THEME.DARK : THEME.LIGHT
      }}
    >
      <div className="app">
        <div className="container">
          <div className="header">
            <TonConnectButton />
          </div>
          <TxForm />
        </div>
      </div>
    </TonConnectUIProvider>
  );
}

export default App;
