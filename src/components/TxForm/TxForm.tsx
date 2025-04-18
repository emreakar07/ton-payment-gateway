import React, {useCallback, useState, useEffect, useRef} from 'react';
import {SendTransactionRequest, useTonConnectUI, useTonWallet} from "@tonconnect/ui-react";
import { createTONTransferTransaction, createUSDTTransferTransaction } from '@utils/jetton-helpers';
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

// Wallet disconnection timeout - 5 minutes
const DISCONNECT_TIMEOUT = 5 * 60 * 1000;
// TON ödemeleri için zaman sınırı - 2 minutes
const TON_PAYMENT_TIMEOUT = 2 * 60 * 1000;

export function TxForm() {
  const [formData, setFormData] = useState<TransferFormData>(defaultFormData);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [transactionSent, setTransactionSent] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  
  const disconnectTimerRef = useRef<number | null>(null);
  const tonPaymentTimerRef = useRef<number | null>(null);
  const wallet = useTonWallet();
  const [tonConnectUi] = useTonConnectUI();

  // TON ödeme zamanlayıcısını başlat
  const startTonPaymentTimer = useCallback(() => {
    // Eğer önceden bir timer varsa temizle
    if (tonPaymentTimerRef.current) {
      window.clearInterval(tonPaymentTimerRef.current);
    }
    
    // Kalan süreyi sıfırla
    setTimeLeft(TON_PAYMENT_TIMEOUT / 1000);
    
    // Yeni timer başlat
    tonPaymentTimerRef.current = window.setInterval(() => {
      setTimeLeft(prev => {
        if (prev === null || prev <= 1) {
          // Süre dolduğunda
          if (tonPaymentTimerRef.current) {
            window.clearInterval(tonPaymentTimerRef.current);
          }
          // Mini app'i kapat
          if (window.Telegram && window.Telegram.WebApp) {
            window.Telegram.WebApp.close();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // TON ödeme zamanlayıcısını temizle
  const clearTonPaymentTimer = useCallback(() => {
    if (tonPaymentTimerRef.current) {
      window.clearInterval(tonPaymentTimerRef.current);
      tonPaymentTimerRef.current = null;
    }
    setTimeLeft(null);
  }, []);

  // Bağlantı kesme zamanlayıcısını başlat
  const startDisconnectTimer = () => {
    // Eğer önceden bir timer varsa temizle
    if (disconnectTimerRef.current) {
      window.clearTimeout(disconnectTimerRef.current);
    }
    
    // Yeni timer başlat
    disconnectTimerRef.current = window.setTimeout(() => {
      if (wallet) {
        console.log('Hareketsizlik nedeniyle cüzdan bağlantısı sonlandırılıyor...');
        tonConnectUi.disconnect();
      }
    }, DISCONNECT_TIMEOUT);
  };

  // Kullanıcı aktivitesi olduğunda timer'ı sıfırla
  const resetDisconnectTimer = () => {
    if (wallet) {
      startDisconnectTimer();
    }
  };

  // Kullanıcı aktivitesini izle
  useEffect(() => {
    if (wallet) {
      // İlk bağlantıda timer'ı başlat
      startDisconnectTimer();
      
      // Kullanıcı aktivitesini izleyen event listener'lar
      const userActivityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
      
      // Her aktivitede timer'ı sıfırla
      const handleUserActivity = () => {
        resetDisconnectTimer();
      };
      
      // Event listener'ları ekle
      userActivityEvents.forEach(eventName => {
        document.addEventListener(eventName, handleUserActivity);
      });
      
      // Sayfa kapanırken bağlantıyı sonlandır
      const handleBeforeUnload = () => {
        console.log('Sayfa kapatılıyor, cüzdan bağlantısı sonlandırılıyor...');
        tonConnectUi.disconnect();
      };
      
      window.addEventListener('beforeunload', handleBeforeUnload);
      
      // Cleanup
      return () => {
        if (disconnectTimerRef.current) {
          window.clearTimeout(disconnectTimerRef.current);
        }
        
        if (tonPaymentTimerRef.current) {
          window.clearInterval(tonPaymentTimerRef.current);
        }
        
        userActivityEvents.forEach(eventName => {
          document.removeEventListener(eventName, handleUserActivity);
        });
        
        window.removeEventListener('beforeunload', handleBeforeUnload);
        
        console.log('Component unmounting, disconnecting wallet...');
        tonConnectUi.disconnect();
      };
    }
  }, [wallet, tonConnectUi]);

  // Wallet bağlantı durumunu izle
  useEffect(() => {
    if (wallet) {
      console.log('Cüzdan bağlandı, timeout timer başlatılıyor');
      startDisconnectTimer();
    } else {
      console.log('Cüzdan bağlantısı kesildi');
      if (disconnectTimerRef.current) {
        window.clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }
    }
  }, [wallet]);

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

      // Eğer TON ödemesi ise zamanlayıcıyı başlat
      if (paymentData.type === 'TON') {
        startTonPaymentTimer();
      }
    }
  }, [startTonPaymentTimer]);

  const createAndSendTransaction = async () => {
    try {
      setLoading(true);
      setError('');
      
      if (!formData.toAddress || !formData.amount) {
        throw new Error('Geçersiz işlem verileri');
      }

      // Cüzdan bağlı değilse, bağlantı penceresini aç
      if (!wallet?.account?.address) {
        await tonConnectUi.connectWallet();
        return; // Bağlantıdan sonra fonksiyondan çık
      }

      // Her işlemde timeout timer'ı sıfırla
      resetDisconnectTimer();

      let transaction: SendTransactionRequest;
      
      if (formData.tokenType === 'TON') {
        transaction = createTONTransferTransaction(
          formData.toAddress,
          formData.amount,
          formData.paymentId
        );
      } else {
        transaction = await createUSDTTransferTransaction(
          formData.toAddress,
          formData.amount,
          wallet.account.address,
          formData.paymentId
        );
      }

      await tonConnectUi.sendTransaction(transaction);
      setTransactionSent(true);
      // İşlem başarılı olduğunda zamanlayıcıyı temizle
      clearTonPaymentTimer();
      // İşlem başarılı olduğunda cüzdan bağlantısı korunur, kullanıcı isterse tekrar işlem yapabilir
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setLoading(false);
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

        {formData.tokenType === 'TON' && timeLeft !== null && (
          <div className="time-left">
            Kalan Süre: {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
          </div>
        )}

        <div className="status-message">
          {!wallet ? (
            <p>İşlemi tamamlamak için lütfen cüzdanınızı bağlayın.</p>
          ) : loading ? (
            <p>İşlem gönderiliyor...</p>
          ) : transactionSent ? (
            <p>İşlem başarıyla gönderildi! Pencere kapanıyor...</p>
          ) : (
            <button 
              onClick={createAndSendTransaction}
              disabled={loading || transactionSent}
              className="send-transaction-button"
            >
              İşlemi Gönder
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

