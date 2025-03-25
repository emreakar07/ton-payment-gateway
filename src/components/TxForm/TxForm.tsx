import React, {useCallback, useState, useEffect} from 'react';
import {SendTransactionRequest, useTonConnectUI, useTonWallet} from "@tonconnect/ui-react";
import { createTONTransferTransaction, createUSDTTransferTransaction } from '@utils/jetton-helpers';
import { useTelegramWebApp } from '@/hooks/useTelegramWebApp';
import './style.scss';

interface TransferFormData {
  toAddress: string;
  amount: string;
  paymentId?: string;
  tokenType: 'TON' | 'USDT';
}

interface PaymentData {
  amount: string;
  address: string;
  payment_id?: string;
  type: 'TON' | 'USDT';
}

const defaultFormData: TransferFormData = {
  toAddress: '',
  amount: '',
  paymentId: '',
  tokenType: 'TON'
};

export function TxForm() {
  const [formData, setFormData] = useState<TransferFormData>(defaultFormData);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [transactionSent, setTransactionSent] = useState(false);

  const wallet = useTonWallet();
  const [tonConnectUi] = useTonConnectUI();
  const { 
    isReady: isTelegramReady, 
    showMainButton, 
    hideMainButton,
    showLoadingMainButton,
    hideLoadingMainButton,
    closeApp,
    expandApp,
    themeParams 
  } = useTelegramWebApp();

  // Cleanup effect - component unmount olduğunda cüzdan bağlantısını kapat
  useEffect(() => {
    // Sayfa yüklendiğinde mevcut bağlantıyı kontrol et
    const checkConnection = async () => {
      const isConnected = await tonConnectUi.getWallets();
      if (isConnected.length > 0) {
        console.log('Mevcut cüzdan bağlantısı bulundu');
      }
    };
    
    checkConnection();

    // Cleanup function - component unmount olduğunda çalışır
    return () => {
      console.log('Component unmounting, disconnecting wallet...');
      tonConnectUi.disconnect();
    };
  }, [tonConnectUi]);

  // Telegram WebApp entegrasyonu
  useEffect(() => {
    if (isTelegramReady) {
      expandApp(); // Mini app'i genişlet

      if (!wallet) {
        showMainButton('Cüzdan Bağla', () => {
          tonConnectUi.connectWallet();
        });
      } else if (!loading && !transactionSent) {
        showMainButton('İşlemi Gönder', createAndSendTransaction);
      }
    }

    return () => {
      hideMainButton();
    };
  }, [isTelegramReady, wallet, loading, transactionSent]);

  // URL'den payment_data parametresini parse et
  const parsePaymentData = (): PaymentData | null => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const paymentDataStr = urlParams.get('payment_data');
      
      if (!paymentDataStr) {
        throw new Error('Payment data bulunamadı');
      }

      // Base64 decode
      const decodedStr = atob(paymentDataStr);
      const paymentData = JSON.parse(decodedStr) as PaymentData;

      // Gerekli alanların kontrolü
      if (!paymentData.amount || !paymentData.address || !paymentData.type) {
        throw new Error('Geçersiz payment_data formatı');
      }

      // Token tipinin kontrolü
      if (paymentData.type !== 'TON' && paymentData.type !== 'USDT') {
        throw new Error('Geçersiz token tipi');
      }

      console.log('Payment data parsed:', {
        ...paymentData,
        payment_id: paymentData.payment_id ? 'MEVCUT' : 'YOK'
      });

      return paymentData;
    } catch (err) {
      console.error('Payment data parse hatası:', err);
      setError(err instanceof Error ? err.message : 'Payment data parse hatası');
      return null;
    }
  };

  // URL'den gelen verileri forma uygula
  useEffect(() => {
    const paymentData = parsePaymentData();
    if (paymentData) {
      setFormData({
        toAddress: paymentData.address,
        amount: paymentData.amount,
        paymentId: paymentData.payment_id,
        tokenType: paymentData.type
      });
    }
  }, []);

  const createAndSendTransaction = async () => {
    try {
      setLoading(true);
      setError('');
      showLoadingMainButton();
      
      if (!formData.toAddress || !formData.amount) {
        throw new Error('Geçersiz işlem verileri');
      }

      let transaction: SendTransactionRequest;
      
      if (formData.tokenType === 'TON') {
        transaction = createTONTransferTransaction(
          formData.toAddress,
          formData.amount,
          formData.paymentId
        );
      } else {
        if (!wallet?.account?.address) {
          throw new Error('Cüzdan bağlı değil');
        }
        transaction = await createUSDTTransferTransaction(
          formData.toAddress,
          formData.amount,
          wallet.account.address,
          formData.paymentId
        );
      }

      await tonConnectUi.sendTransaction(transaction);
      setTransactionSent(true);
      hideMainButton();
      setTimeout(() => {
        closeApp();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setLoading(false);
      hideLoadingMainButton();
    }
  };

  return (
    <div className="send-tx-form">
      <div className="form-preview">
        <div className="form-group">
          <label>Token Tipi:</label>
          <div className="value">{formData.tokenType}</div>
        </div>

        <div className="form-group">
          <label>Alıcı Adresi:</label>
          <div className="value">{formData.toAddress}</div>
        </div>

        <div className="form-group">
          <label>Miktar:</label>
          <div className="value">{formData.amount} {formData.tokenType}</div>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="status-message">
          {!wallet ? (
            <p>İşlemi tamamlamak için lütfen cüzdanınızı bağlayın.</p>
          ) : loading ? (
            <p>İşlem gönderiliyor...</p>
          ) : transactionSent ? (
            <p>İşlem başarıyla gönderildi! Pencere kapanıyor...</p>
          ) : (
            <p>Cüzdan bağlandı, işlemi göndermek için hazır.</p>
          )}
        </div>
      </div>
    </div>
  );
}

