/**
 * TON'da Jetton (USDT, vb.) işlemleri için yardımcı fonksiyonlar.
 * TEP-74 standardına göre Jetton transfer işlemlerini oluşturur.
 * 
 * Not: Gerçek bir uygulamada, bu fonksiyonlar yerine @ton/ton, @ton/core 
 * veya tonweb gibi kütüphanelerdeki resmi yöntemleri kullanmalısınız.
 */

import { 
  Address,
  beginCell,
  Cell,
  toNano as tonCoreToNano,
  fromNano as tonCoreFromNano,
  storeStateInit
} from '@ton/core';
import { SendTransactionRequest } from '@tonconnect/ui-react';
import { TonClient, JettonMaster} from '@ton/ton';

// USDT Jetton sabitleri
const USDT_DECIMALS = 6; // USDT 6 decimal kullanıyor, TON gibi 9 değil
const USDT_JETTON_MASTER = "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";

// Jetton işlem sabitleri - TEP-74 standardına göre
const JETTON_TRANSFER_OP_CODE = 0xf8a7ea5; // Jetton transfer opcode, TEP-74'e göre doğru
const JETTON_INTERNAL_TRANSFER_OP_CODE = 0x178d4519; // Internal transfer notification
const JETTON_TRANSFER_NOTIFICATION_OP_CODE = 0x7362d09c; // Transfer notification
const QUERY_ID = 0; // 0 genellikle varsayılan değerdir

// TON dokümantasyonundan alınan resmi Jetton wallet kodu
const JETTON_WALLET_CODE = Cell.fromBoc(Buffer.from('b5ee9c72010101010023000842028f452d7a4dfd74066b682365177259ed05734435be76b5fd4bd5d8af2b7c3d68', 'hex'))[0];

interface JettonWalletResponse {
  jetton_wallets: Array<{
    address: string;
    balance: string;
    jetton: string;
    owner: string;
  }>;
}

/**
 * TON miktarını nanoTON'a çevirir (1 TON = 10^9 nanoTON)
 */
export function toNano(amount: string): string {
  try {
    // Sayısal değere çevir
    const value = parseFloat(amount);
    if (isNaN(value)) {
      throw new Error("Geçersiz TON miktarı");
    }
    
    // 9 decimal'e göre çevir (10^9)
    const multiplier = Math.pow(10, 9);
    const result = Math.floor(value * multiplier).toString();
    
    console.log(`TON dönüşümü: ${amount} -> ${result} (9 decimal)`);
    return result;
  } catch (error) {
    console.error("TON dönüşüm hatası:", error);
    throw error;
  }
}

/**
 * nanoTON miktarını TON'a çevirir
 */
export function fromNano(amount: string): string {
  try {
    const value = BigInt(amount);
    const divisor = BigInt(10 ** 9);
    const whole = value / divisor;
    const fraction = value % divisor;
    
    // Fraction kısmını 9 basamağa tamamla
    const fractionStr = fraction.toString().padStart(9, '0');
    
    // Sondaki sıfırları temizle
    const cleanFraction = fractionStr.replace(/0+$/, '');
    
    return cleanFraction ? `${whole}.${cleanFraction}` : whole.toString();
  } catch (error) {
    console.error("TON dönüşüm hatası:", error);
    throw error;
  }
}

/**
 * USDT miktarını minimum birime çevirir (1 USDT = 10^6 minimum birim)
 * TON'dan farklı olarak USDT 6 decimal kullanır
 */
export function toNanoJetton(amount: string): string {
  try {
    // Sayısal değere çevir
    const value = parseFloat(amount);
    if (isNaN(value)) {
      throw new Error("Geçersiz USDT miktarı");
    }
    
    // 6 decimal'e göre çevir (10^6)
    const multiplier = Math.pow(10, USDT_DECIMALS);
    const result = Math.floor(value * multiplier).toString();
    
    console.log(`USDT dönüşümü: ${amount} -> ${result} (${USDT_DECIMALS} decimal)`);
    return result;
  } catch (error) {
    console.error("USDT dönüşüm hatası:", error);
    throw error;
  }
}

/**
 * Minimum birimden USDT'ye çevirir
 */
export function fromNanoJetton(amount: string): string {
  try {
    const value = BigInt(amount);
    const divisor = BigInt(10 ** USDT_DECIMALS);
    const whole = value / divisor;
    const fraction = value % divisor;
    
    // Fraction kısmını 6 basamağa tamamla
    const fractionStr = fraction.toString().padStart(USDT_DECIMALS, '0');
    
    // Sondaki sıfırları temizle
    const cleanFraction = fractionStr.replace(/0+$/, '');
    
    return cleanFraction ? `${whole}.${cleanFraction}` : whole.toString();
  } catch (error) {
    console.error("USDT dönüşüm hatası:", error);
    throw error;
  }
}

/**
 * Adres temizleme ve formatlama
 * TON adreslerinde '-_' karakterleri görmezden gelinir
 * Farklı adres formatlarını destekler (user-friendly, raw, bounceable, non-bounceable)
 */
export function formatTONAddress(address: string | Address): string {
  try {
    // Adres boş kontrolü
    if (!address) {
      throw new Error("Adres boş olamaz");
    }
    
    // Eğer zaten Address tipinde ise doğrudan string'e çevir
    if (typeof address !== 'string') {
      return address.toString();
    }
    
    // Adres stringini temizle (- ve _ karakterlerini kaldır)
    const cleanAddress = address.replace(/[_\-]/g, '');
    
    // Farklı adres formatlarını kontrol et
    try {
      // Önce standart adresi parse etmeyi dene (user-friendly, bounceable veya non-bounceable)
      return Address.parse(cleanAddress).toString();
    } catch (parseError) {
      // Parse hatası aldıysak, hatayı loglayalım
      console.warn("Adres parse hatası:", parseError);
      console.warn("Hatalı adres:", address);
      
      // Hatalı adres görünüyorsa, Telegram'dan gelen adresler için sık görülen düzeltmeleri yapalım
      
      // 1. Eğer adres UQ, EQ, kQ ile başlıyorsa ve / karakteri içeriyorsa
      // Bu Telegram'ın bazı durumlarda oluşturduğu hatalı bir format
      if ((cleanAddress.startsWith('UQ') || cleanAddress.startsWith('EQ') || cleanAddress.startsWith('kQ')) && 
          cleanAddress.includes('/')) {
        // "/" karakterini temizle
        const fixedAddress = cleanAddress.split('/')[0];
        console.log("Düzeltilen adres:", fixedAddress);
        
        try {
          return Address.parse(fixedAddress).toString();
        } catch (e) {
          console.warn("Düzeltilmiş adres de parse edilemedi:", e);
        }
      }
      
      // Eğer tüm düzeltme denemeleri başarısız olursa, 
      // adresi olduğu gibi kullan - bu muhtemelen bir hata oluşturacak
      // ama en azından işlemin devam etmesine izin verir
      console.error("Adres formatlanamadı, orijinal adres kullanılıyor:", cleanAddress);
      return cleanAddress;
    }
  } catch (error) {
    console.error("Adres formatlama hatası:", error);
    throw new Error(`Geçersiz TON adresi: ${address}`);
  }
}

/**
 * Jetton cüzdan adresini v3 API kullanarak hesaplar
 * 
 * @param ownerAddress Cüzdan sahibi adresi
 * @param masterAddress Jetton master adresi
 * @returns Hesaplanan jetton cüzdan adresi
 */
export async function calculateJettonWalletAddress(ownerAddress: string, masterAddress: string = USDT_JETTON_MASTER): Promise<string> {
    try {
        // Adresleri temizle ve doğrula
        const cleanOwnerAddress = Address.parse(ownerAddress).toString();
        const cleanMasterAddress = Address.parse(masterAddress).toString();
        
        console.log("Jetton wallet hesaplanıyor:");
        console.log("- Owner address:", cleanOwnerAddress);
        console.log("- Master address:", cleanMasterAddress);

        // v3 API'ye istek at
        const response = await fetch(`https://toncenter.com/api/v3/jetton/wallets?owner_address=${cleanOwnerAddress}&jetton_address=${cleanMasterAddress}&limit=1`);
        
        if (!response.ok) {
            throw new Error(`API yanıt vermedi: ${response.status}`);
        }

        const data = await response.json() as JettonWalletResponse;
        
        // API yanıtını kontrol et
        if (data.jetton_wallets && data.jetton_wallets.length > 0) {
            const walletInfo = data.jetton_wallets[0];
            console.log("Jetton wallet bulundu:");
            console.log("- Address:", walletInfo.address);
            console.log("- Balance:", walletInfo.balance);
            console.log("- Owner:", walletInfo.owner);
            return walletInfo.address;
        } else {
            throw new Error("Jetton wallet bulunamadı");
        }
    } catch (error) {
        console.error("Jetton wallet hesaplama hatası:", error);
        throw error;
    }
}

/**
 * Jetton transfer için cell payload oluşturur
 * TON dokümantasyonundaki resmi örneğe ve güncel kütüphanelere göre
 * TEP-74 standardına uygun
 * 
 * @param destinationAddress Alıcı adresi
 * @param jettonAmount Jetton miktarı (nanoJetton olarak)
 * @param senderAddress Gönderici adresi (fazla TON'lar için) 
 * @param tonAmount İletilecek TON miktarı (0.05 TON varsayılan)
 * @param comment Eklenecek yorum (isteğe bağlı)
 * @returns Cell formatında payload
 */
export function createJettonTransferCell(
  destinationAddress: string,
  jettonAmount: string,
  senderAddress: string,
  tonAmount: string = "0.05",
  comment?: string
): Cell {
  try {
    // Adresleri temizle ve parse et
    const destination = Address.parse(destinationAddress);
    const sender = Address.parse(senderAddress);
    
    console.log("Hedef adres:", destination.toString());
    console.log("Gönderici adres:", sender.toString());
    
    // Forward miktarını nanoTON'a çevir
    const forwardAmount = tonCoreToNano(tonAmount);
    console.log("Forward miktar:", forwardAmount.toString());
    
    // Yorum cell'i oluştur (eğer yorum varsa)
    let commentCell;
    if (comment && comment.length > 0) {
      commentCell = beginCell()
        .storeUint(0, 32) // Text tipini belirten 0 opcode
        .storeStringTail(comment)
        .endCell();
      
      console.log("Yorum eklendi:", comment);
    }
    
    // Jetton transfer opcode 0xf8a7ea5 (tam hali: 0x0f8a7ea5)
    // Güncel kütüphaneler 32-bit opcode kullanıyor, bu yüzden 0x0f8a7ea5 kullanıyoruz
    const builder = beginCell()
      .storeUint(0x0f8a7ea5, 32) // transfer opcode: 0x0f8a7ea5
      .storeUint(QUERY_ID, 64) // queryId, genellikle 0
      .storeCoins(BigInt(jettonAmount)) // jetton miktarı
      .storeAddress(destination) // hedef adres (alıcı cüzdan adresi)
      .storeAddress(sender) // response_destination - fazla TON'lar buraya gönderilir
      .storeBit(0) // custom_payload bit (0 = yok)
      .storeCoins(forwardAmount); // forward_ton_amount
    
    // Eğer yorum varsa, Cell referansı olarak ekle
    if (commentCell) {
      // Yorum hücresini referans olarak ekle (1 = referans olarak sakla)
      builder.storeBit(1);
      builder.storeRef(commentCell);
    } else {
      // Yorum yoksa, 0 bit ile belirt (0 = referans yok, içerik yok)
      builder.storeBit(0);
    }
    
    const resultCell = builder.endCell();
    console.log("Transfer cell başarıyla oluşturuldu");
    
    return resultCell;
  } catch (error) {
    console.error("Jetton transfer cell oluşturma hatası:", error);
    throw new Error(`Jetton transfer cell oluşturulamadı: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
  }
}

/**
 * Bir mesajı hashing için BOC formatına çevirir
 * Güvenli try-catch ile serileştirme yapar
 */
export function serializeToBase64(cell: Cell): string {
  try {
    const boc = cell.toBoc();
    console.log("Serileştirme başarılı, boyut:", boc.length, "bytes");
    return boc.toString('base64');
  } catch (error) {
    console.error("Serileştirme hatası:", error);
    
    // Hata durumunda boş bir cell'i serileştirmeyi dene
    try {
      const emptyCell = beginCell().endCell();
      return emptyCell.toBoc().toString('base64');
    } catch (e) {
      console.error("Boş cell serileştirme de başarısız:", e);
      // En son çare olarak sabit bir değer
      return '';
    }
  }
}

/**
 * Payment ID'den bir Cell oluşturur
 */
export function createPaymentIdCell(paymentId: string): Cell {
  try {
    // Boş kontrol
    if (!paymentId) {
      console.warn("Boş payment ID için basit Cell oluşturuluyor");
      return beginCell().storeUint(0, 32).endCell();
    }
    
    return beginCell()
      .storeUint(0, 32) // prefix
      .storeBuffer(Buffer.from(paymentId))
      .endCell();
  } catch (error) {
    console.error("Payment ID cell oluşturma hatası:", error);
    // Hata durumunda basit bir cell döndür
    return beginCell().storeUint(0, 32).endCell();
  }
}

/**
 * USDT transfer işlemi oluşturur - TON dokümantasyonundan alınmış
 * 
 * @param toAddress Alıcı adresi
 * @param amount USDT miktarı
 * @param fromAddress Gönderici adresi
 * @param paymentId Ödeme kimliği (isteğe bağlı)
 * @returns TonConnect işlem nesnesi
 */
export async function createUSDTTransferTransaction(
  toAddress: string, 
  amount: string,
  fromAddress: string,
  paymentId?: string
): Promise<SendTransactionRequest> {
  try {
    console.log("USDT Transfer işlemi oluşturuluyor:");
    console.log(`- From: ${fromAddress}`);
    console.log(`- To: ${toAddress}`);
    console.log(`- Amount: ${amount} USDT`);
    
    // Adresleri temizle ve doğrula
    let destinationAddr = toAddress;
    let responseAddr = fromAddress;
    
    // Adres içinde slash varsa temizle (Telegram cüzdanlarında yaygın)
    if (destinationAddr.includes('/')) {
      console.log(`Alıcı adresi slash içeriyor: "${destinationAddr}"`);
      destinationAddr = destinationAddr.split('/')[0];
      console.log(`Temizlenmiş alıcı adresi: "${destinationAddr}"`);
    }
    
    if (responseAddr.includes('/')) {
      console.log(`Gönderen adresi slash içeriyor: "${responseAddr}"`);
      responseAddr = responseAddr.split('/')[0];
      console.log(`Temizlenmiş gönderen adresi: "${responseAddr}"`);
    }
    
    try {
      // Adresleri parse et
      destinationAddr = Address.parse(destinationAddr).toString();
      responseAddr = Address.parse(responseAddr).toString();
      
      console.log("Adresler başarıyla parse edildi:");
      console.log(`- Destination: ${destinationAddr}`);
      console.log(`- Response: ${responseAddr}`);
    } catch (parseError) {
      console.warn(`Adres parse hatası: ${parseError instanceof Error ? parseError.message : 'Bilinmeyen hata'}`);
      // Parse hatası olsa bile devam et, belki işlem başarılı olabilir
    }
    
    // Jetton wallet adresini hesapla
    let jettonWalletAddress;
    try {
      jettonWalletAddress = await calculateJettonWalletAddress(responseAddr, USDT_JETTON_MASTER);
      console.log("- Jetton Wallet:", jettonWalletAddress);
    } catch (error) {
      console.error("Jetton wallet adresi hesaplanamadı:", error);
      throw new Error(`Jetton wallet adresi hesaplanamadı: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    }
    
    // USDT miktarını minimum birime çevir (6 decimal)
    const jettonAmount = toNanoJetton(amount);
    console.log("- USDT Amount:", amount);
    console.log("- USDT Amount (minimum birim):", jettonAmount);
    
    // Forward payload (comment) oluştur
    const comment = paymentId ? `Payment ID: ${paymentId}` : "USDT Transfer";
    const forwardPayload = beginCell()
      .storeUint(0, 32) // Text comment op-code
      .storeStringTail(comment)
      .endCell();
    
    // TEP-74 standardına göre transfer message body oluştur
    const messageBody = beginCell()
      .storeUint(0x0f8a7ea5, 32) // transfer op-code
      .storeUint(0, 64) // query_id
      .storeCoins(BigInt(jettonAmount)) // amount (6 decimal)
      .storeAddress(Address.parse(destinationAddr)) // destination
      .storeAddress(Address.parse(responseAddr)) // response_destination
      .storeBit(0) // no custom payload
      .storeCoins(1n) // forward_ton_amount = 1 nanoton
      .storeBit(1) // forward payload as ref
      .storeRef(forwardPayload) // comment
      .endCell();
    
    // Message body'yi base64'e çevir
    const payload = messageBody.toBoc().toString('base64');
    console.log("Message body oluşturuldu");
    
    // İşlem için minimum TON miktarı: 0.05 TON
    const minTonAmount = "50000000"; // 0.05 TON
    
    // TonConnect transaction objesi
    const transaction: SendTransactionRequest = {
      validUntil: Math.floor(Date.now() / 1000) + 300, // 5 dakika
      messages: [
        {
          address: jettonWalletAddress,
          amount: minTonAmount,
          payload: payload
        }
      ]
    };
    
    console.log("İşlem hazır:");
    console.log("- TON Amount:", minTonAmount, "nanoTON");
    console.log("- USDT Amount:", amount, "USDT");
    console.log("- USDT Amount (minimum birim):", jettonAmount);
    console.log("- Valid until:", new Date(transaction.validUntil * 1000).toLocaleString());
    
    return transaction;
  } catch (error) {
    console.error("USDT Transfer hatası:", error);
    throw error;
  }
}

/**
 * TON transfer işlemi oluşturur
 * 
 * @param toAddress Alıcı adresi
 * @param amount TON miktarı
 * @param paymentId Ödeme kimliği (isteğe bağlı)
 * @returns TonConnect işlem nesnesi
 */
export function createTONTransferTransaction(
  toAddress: string, 
  amount: string,
  paymentId?: string
): SendTransactionRequest {
  try {
    console.log("=============== TON TRANSFER İŞLEMİ ===============");
    console.log("Girdi parametreleri:");
    console.log(`- To Address: "${toAddress}"`);
    console.log(`- Amount: ${amount} TON`);
    console.log(`- Payment ID: ${paymentId || "Yok"}`);
    console.log("-------------------------------------------------------");
    
    // Adres formatını temizle ve kontrol et
    let formattedAddress = toAddress;
    
    // Adres içinde slash varsa temizle (Telegram cüzdanlarında yaygın)
    if (formattedAddress.includes('/')) {
      console.log(`Adres slash içeriyor: "${formattedAddress}"`);
      formattedAddress = formattedAddress.split('/')[0];
      console.log(`Temizlenmiş adres: "${formattedAddress}"`);
    }
    
    try {
      // Adresi parse etmeyi dene
      const parsedAddress = Address.parse(formattedAddress);
      formattedAddress = parsedAddress.toString();
      console.log(`Adres başarıyla parse edildi: "${formattedAddress}"`);
    } catch (parseError) {
      console.warn(`Adres parse hatası: ${parseError instanceof Error ? parseError.message : 'Bilinmeyen hata'}`);
      console.warn(`Orijinal adres "${toAddress}" kullanılmaya devam ediliyor`);
      
      // Adres parse edilemiyorsa orijinal haliyle kullan, bu hata verebilir
      // ancak kullanıcıya bir şans vermiş oluruz
      formattedAddress = toAddress;
    }
    
    // TON miktarını nanoTON'a çevir (9 decimal)
    const tonAmount = toNano(amount);
    console.log(`- TON miktarı (nano): ${tonAmount}`);
    
    // Yorum oluştur (varsa)
    let comment = "";
    let payload = "";
    
    if (paymentId) {
      comment = `Payment ID: ${paymentId}`;
      const commentCell = beginCell()
        .storeUint(0, 32) // Metin tipi
        .storeBuffer(Buffer.from(comment, 'utf-8'))
        .endCell();
      
      payload = serializeToBase64(commentCell);
      console.log("Yorum detayları:");
      console.log(`- İçerik: "${comment}"`);
      console.log(`- Cell hex: ${commentCell.toBoc().toString('hex').substring(0, 50)}...`);
      console.log(`- Payload (base64): ${payload.substring(0, 50)}...`);
    } else {
      console.log("- Yorum/Payload: Yok");
    }
    
    // İşlem nesnesini oluştur
    const transaction: SendTransactionRequest = {
      validUntil: Math.floor(Date.now() / 1000) + 300, // 5 dakika geçerli
      messages: [
        {
          address: formattedAddress,
          amount: tonAmount,
          payload: payload
        }
      ]
    };
    
    console.log("Final transaction:");
    console.log(`- Geçerlilik süresi: ${new Date(transaction.validUntil * 1000).toLocaleString()}`);
    console.log(`- Alıcı adres: "${formattedAddress}"`);
    console.log(`- Gönderilen TON: ${amount} TON (${tonAmount} nano)`);
    console.log(`- Payload boyutu: ${payload ? payload.length : 0} karakter`);
    console.log("================= İŞLEM OLUŞTURULDU =================");
    
    return transaction;
  } catch (error) {
    console.error("❌ TON TRANSFER İŞLEMİ OLUŞTURMA HATASI:", error);
    throw new Error(`TON transfer işlemi oluşturulamadı: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
  }
} 