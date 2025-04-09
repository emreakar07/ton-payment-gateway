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

// TON fiyatını USDT cinsinden getiren API fonksiyonu
async function getTonPrice(): Promise<number> {
  try {
    // CoinGecko API kullanılarak TON/USD fiyatı alınıyor
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=toncoin&vs_currencies=usd');
    const data = await response.json();
    return data.toncoin.usd;
  } catch (error) {
    console.error('TON fiyatı alınamadı:', error);
    // Hata durumunda varsayılan bir değer (örn. son bilinen değer)
    return 6.5; // Varsayılan TON/USDT değeri, güncel değer ile değiştirilmelidir
  }
}

export function TxForm() {
  const [formData, setFormData] = useState<TransferFormData>(defaultFormData);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [transactionSent, setTransactionSent] = useState(false);
  const [calculatedAmount, setCalculatedAmount] = useState<string | null>(null);
  
  const disconnectTimerRef = useRef<number | null>(null);
  const wallet = useTonWallet();
  const [tonConnectUi] = useTonConnectUI();

  // Bağlantı kesme zamanlayıcısını başlat - sabit 5 dakika
  const startFixedDisconnectTimer = useCallback(() => {
    // Eğer önceden bir timer varsa temizle
    if (disconnectTimerRef.current) {
      window.clearTimeout(disconnectTimerRef.current);
    }
    
    // Yeni timer başlat - tam 5 dakika sonra bağlantıyı kes
    disconnectTimerRef.current = window.setTimeout(() => {
      if (wallet) {
        console.log('5 dakika doldu, cüzdan bağlantısı sonlandırılıyor...');
        tonConnectUi.disconnect();
      }
    }, DISCONNECT_TIMEOUT);
  }, [wallet, tonConnectUi]);

  // Wallet bağlantı durumunu izle
  useEffect(() => {
    if (wallet) {
      console.log('Cüzdan bağlandı, 5 dakikalık timer başlatılıyor');
      startFixedDisconnectTimer();
    } else {
      console.log('Cüzdan bağlantısı kesildi');
      if (disconnectTimerRef.current) {
        window.clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }
    }
  }, [wallet, startFixedDisconnectTimer]);

  // Temizleme işlemi
  useEffect(() => {
    return () => {
      if (disconnectTimerRef.current) {
        window.clearTimeout(disconnectTimerRef.current);
      }
      
      console.log('Component unmounting, disconnecting wallet...');
      tonConnectUi.disconnect();
    };
  }, [tonConnectUi]);

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
      
      if (!formData.toAddress || !formData.amount) {
        throw new Error('Geçersiz işlem verileri');
      }

      // Cüzdan bağlı değilse, bağlantı penceresini aç
      if (!wallet?.account?.address) {
        await tonConnectUi.connectWallet();
        return; // Bağlantıdan sonra fonksiyondan çık
      }

      let transaction: SendTransactionRequest;
      let actualAmount = formData.amount;

      // Sadece TON işlemleri için anlık fiyat düzenlemesi
      if (formData.tokenType === 'TON') {
        const tonPrice = await getTonPrice();
        const usdtValue = parseFloat(formData.amount);
        actualAmount = (usdtValue / tonPrice).toFixed(9);
        setCalculatedAmount(actualAmount);
        console.log(`USDT ${formData.amount} -> TON ${actualAmount} (Fiyat: ${tonPrice} USDT)`);
      }
      
      if (formData.tokenType === 'TON') {
        transaction = createTONTransferTransaction(
          formData.toAddress,
          actualAmount,
          formData.paymentId
        );
      } else {
        transaction = await createUSDTTransferTransaction(
          formData.toAddress,
          actualAmount,
          wallet.account.address,
          formData.paymentId
        );
      }

      await tonConnectUi.sendTransaction(transaction);
      setTransactionSent(true);
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
          <div className="value">
            {formData.amount} {formData.tokenType === 'TON' ? 'USDT' : formData.tokenType}
            {calculatedAmount && formData.tokenType === 'TON' && (
              <span className="converted-amount"> (~{calculatedAmount} TON)</span>
            )}
          </div>
        </div>

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

