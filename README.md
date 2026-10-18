# Okur (KitapOkur)

Raspberry Pi üzerinde çalışan, ev ağından erişilen PDF okuyucu. Her kitap için
kaldığın yeri sunucuda saklar; telefondan bırakıp bilgisayardan devam edebilirsin.

1. Kütüphane, PDF yükleme, okuyucu, kitap bazında kaldığın yer.
2. Kelime çıkarma, seviye filtresi, kelime paneli ve sayfa üzerinde vurgular.
3. Google çevirisi, türlere göre anlamlar, tanım, telaffuz ve Tatoeba örnek cümleleri.
4. FSRS ile flashcard çalışma (klasik, tersten, boşluk doldurma).
5. Şifresiz profiller: kitaplık ortak, her kişinin ilerlemesi ayrı.
6. İçindekiler ve PDF içi bağlantılar, kart tarayıcısı ve elle kart ekleme, telefona kurulum (PWA).

## İçindekiler ve bağlantılar

Okuyucunun üst barındaki **İçindekiler** düğmesi bölüm listesini açar; okuduğun
bölüm işaretlidir. PDF'in kendi içindekiler tablosu varsa o kullanılır. Yoksa
(Gutenberg kopyası romanlarda sık) "CHAPTER IV." gibi tek satırlık başlıklar
sayfalardan bulunur. Liste ilk açılışta bir kez hesaplanıp saklanır.

PDF içindeki bağlantılar (basılı içindekiler sayfası, dipnotlar) tıklanabilir.
Bağlantıyla gittikten sonra çıkan **Geri dön** düğmesi okuduğun yere döndürür.
Web adresleri yeni sekmede açılır.

## Kelimeler nasıl seçiliyor?

PDF yüklendiğinde arka planda:

1. Her sayfanın metni çıkarılır (satır sonu tirelemeleri birleştirilir, ﬁ/ﬂ gibi bitişik harfler açılır)
   ve cümlelere bölünür.
2. Kelimeler simplemma ile köke indirgenir: *running, ran → run*. simplemma'nın
   bilinen hataları (ör. *gone → gan*, *fixed → fixe*) sıklık kontrolüyle yakalanıp düzeltilir.
3. Her kökün İngilizcedeki sıklığı [wordfreq](https://github.com/rspeer/wordfreq) ile bulunur.
4. Kitapta hiç küçük harfle geçmeyen kelimeler (Elizabeth, London) özel ad sayılıp elenir.
5. Seçtiğin seviyede bilinmesi beklenen yaygın kelimeler gösterilmez:

   | Seviye | Bilindiği varsayılan |
   |---|---|
   | A2 · temel | en yaygın ~1.100 kelime |
   | B1 · orta (varsayılan) | ~3.000 |
   | B2 · orta üstü | ~7.200 |
   | C1 · ileri | ~15.000 |

432 sayfalık bir roman bu bilgisayarda 0,6 saniyede işlendi; okumaya beklemeden başlanabilir.

Okuyucuda:

- Sayfadaki yeni kelimeler sarı, öğrenmeye seçtiklerin yeşil vurgulanır. Vurgular
  PDF'in kendi kelime koordinatlarından çizilir, iki yana yaslı metinde de kaymaz.
- Vurgusuz bir kelimeye tıklamak da onu panelde açar (ör. "the" gibi yaygın bir kelimeyi
  bile öğrenmek istersen).
- **Öğren** kelimeyi kitaptaki cümlesiyle birlikte desteye ekler, **Biliyorum** ve
  **Yoksay** onu tüm kitaplarda gizler. İkisi de "Geri al" ile geri alınabilir.
- Kelime durumu kitaplar arasında ortaktır: bir kitapta bildiğini söylediğin kelime
  diğerinde de çıkmaz.

## Çeviri, sözlük ve örnek cümleler

| Bilgi | Kaynak | Ne zaman alınır |
|---|---|---|
| Kelimenin Türkçesi | Google Çeviri | Kitap yüklenince, tüm aday kelimeler toplu (432 sayfalık roman ≈ 7 istek, 10 sn) |
| Türlere göre anlamlar (sıfat: endişeli, kaygılı…) | Google Çeviri sözlüğü | Kelime kartı ilk açıldığında |
| İngilizce tanım, IPA, ses kaydı | Free Dictionary API, yanıt vermezse Wiktionary | Kelime kartı ilk açıldığında |
| Kitaptaki cümlenin çevirisi | Google Çeviri | Kart açıldığında |
| Örnek cümle + Türkçesi | Tatoeba (Pi'de yerel kopya) | Her zaman; internet gerekmez |
| Biçimler (go · went · gone) | lemminflect (yerel) | Her zaman; internet gerekmez |

**Kelime biçimleri.** Kelime kartında ve çalışma kartının arka yüzünde fiilin
V1 · V2 · V3 · -ing · -s hâlleri, düzensiz isimlerin çoğulu (child → children)
ve sıfatların dereceleri (good → better → best) gösterilir. Düzensiz biçimler
amber renktedir. Kart ayrıca kelimenin kitapta hangi hâliyle geçtiğini yazar
("Kitapta: went · geçmiş zaman (V2)"). Hangi türlerin gösterileceği sözlükten gelen
tür bilgisiyle seçilir. Düzenli çoğullar (-s) ve "more beautiful" gibi kurallı
dereceler kalabalık etmesin diye gösterilmez. Biçim verisi ilk kullanımda
yüklenir ve ~50 MB bellek tutar.

Her şey veritabanında saklanır; aynı kelime ya da cümle için bir daha internete
çıkılmaz. "Öğren" denen kelimelerin bilgisi hemen alınır, böylece flashcard
çalışırken internet gerekmez. Ses kaydı yoksa (ya da cihaz çalamıyorsa) tarayıcının
konuşma sentezi kullanılır.

**Çeviri sağlayıcısı.** Varsayılan, Google'ın anahtarsız uç noktasıdır (resmî değil,
istek sınırı olabilir). Resmî Cloud Translation API'ye geçmek için (ayda 500.000
karakter ücretsiz, Google Cloud hesabı gerekir):

```bash
KITAPOKUR_TRANSLATOR=google-cloud KITAPOKUR_GOOGLE_API_KEY=... ./run.sh
```

**Tatoeba.** İlk açılışta İngilizce–Türkçe cümle çiftleri (~37 MB indirme,
~670.000 çift, 83 MB veritabanı) arka planda indirilir ve ayda bir tazelenir.
Kurulum ayrı, düşük öncelikli bir süreçte çalışır (~350 MB geçici bellek); bittiğinde
bellek tamamen geri döner. Elle çalıştırmak için `cd backend && python -m app.tatoeba`.

## Flashcard çalışma

- Aralıklar [FSRS](https://github.com/open-spaced-repetition/py-fsrs) ile hesaplanır
  (Anki'nin yeni algoritması, hedef hatırlama oranı %90).
- Günlük yeni kart sınırı (varsayılan 20) çalışma ekranından değiştirilir. Gün sabah 4'te döner.
- Alıştırma türleri: **Klasik** (İngilizce → Türkçe), **Tersten** (Türkçe → İngilizce),
  **Boşluk doldurma** (kitaptaki cümlede kelime boş bırakılır), **Çoktan seçmeli**, **Karışık**.
- **Çoktan seçmeli:** İngilizce kelime ve kitaptaki cümlesi gösterilir, dört Türkçe
  anlamdan biri seçilir. Yanlış şıklar aynı kitaptan, sıklığı ve türü benzer
  kelimelerden gelir (fiile fiil, isme isim). Anlamı doğru cevapla örtüşen şıklar
  alınmaz. Doğru cevap "İyi", yanlış cevap "Tekrar" sayılır. Doğru ama tahminle
  bilinen cevap için **Tahminle bildim** ("Zor") seçilebilir. Telefonda şıklar alt
  alta, büyük düğmeler olarak çıkar. Kısayol: <kbd>1</kbd>–<kbd>4</kbd> şık seçer.
- Deste tüm kitaplar ya da tek bir kitap olarak seçilebilir.
- Kısayollar: <kbd>Boşluk</kbd> cevabı göster, <kbd>1</kbd>–<kbd>4</kbd> puanla, <kbd>S</kbd> dinle.
- Bir kelimeye sonradan "Biliyorum" denirse kartı askıya alınır, geçmişi silinmez.

**Kartlar sayfası** (menüde *Kartlar*) Anki'deki kart tarayıcısının karşılığıdır:

- Tüm kartları ara (kelime ya da Türkçe anlam), durumuna göre süz
  (zamanı gelen, yeni, öğreniyor, tekrar, askıda), desteye ya da tekrar zamanına göre sırala.
- Bir karta dokunup kendi anlamını, örnek cümlesini ve notunu yaz. Not, çalışırken
  cevabın altında görünür. Anlamı boş bırakırsan otomatik çeviri kullanılır.
- Kartı askıya al, baştan öğren (yeni kart hâline döner) ya da sil. Silinen kartın
  kelimesi kitaplarda yeniden "yeni" görünür.
- **Kart ekle** ile kitapta geçmeyen bir kelimeyi ya da kalıbı ("give up") ekle.
  Tek kelimeler kök hâline getirilir ("went" → "go"); anlam boşsa otomatik çevrilir.
- Kısayollar: <kbd>/</kbd> ara, <kbd>N</kbd> yeni kart.

## Profiller

Şifre yoktur; açılışta "Kim okuyor?" ekranından profil seçilir ve seçim tarayıcıda
saklanır. Kitaplık herkes için ortaktır. **Profile özel olanlar:** her kitaptaki
okuma konumu, bilinen/öğrenilen kelimeler, deste ve tekrar geçmişi, seviye ve
günlük yeni kart ayarı. Profil değiştirmek için kütüphanenin sağ üstündeki profil
düğmesine dokun.

## Mimari

| Katman | Seçim | Neden |
|---|---|---|
| Sunucu | Python 3.11+, FastAPI, uvicorn (uvloop + httptools) | Hafif, asenkron; PDF ve dil araçları Python'da güçlü |
| Veritabanı | SQLite (WAL) | Bir ev için fazlasıyla yeterli, kurulum gerektirmez |
| PDF işleme | PyMuPDF | Sayfa boyutları, kapak, meta veri; Pi'de çok hızlı |
| Görüntüleme | PDF.js 5.7 (tarayıcıda) | Sayfa çizme yükü Pi'de değil, okuduğun cihazda |
| Arayüz | Derleme adımı olmayan HTML/CSS/JS | Pi'de Node gerekmez |

Pi'yi rahatlatan kararlar:

- PDF tarayıcıda çizilir; Pi yalnızca dosyayı sunar.
- PDF bütünüyle indirilmez. PDF.js yalnızca gereken parçaları HTTP Range istekleriyle ister
  (`disableAutoFetch`), 500 sayfalık bir kitap da anında açılır.
- Sayfa boyutları yüklemede bir kez hesaplanıp saklanır. Okuyucu bütün sayfa
  iskeletini PDF'i beklemeden kurar ve doğrudan kaldığın sayfaya atlar.
- Sadece ekrandaki sayfalar ve bir sonraki/önceki sayfa çizilir; uzaktakilerin
  tuvalleri bırakılır (telefonlarda bellek taşmaz).
- Yüklemeler multipart yerine ham gövdeyle diske akıtılır, aynı anda SHA-256
  hesaplanır. Aynı PDF iki kez yüklenirse fark edilir.
- Arka plan işlemleri tek bir işçide sırayla yürür; okuma istekleri beklemez.
- PDF ve kapaklar içerik hash'iyle saklanır, tarayıcıda süresiz önbelleğe alınır.
- PDF.js ve yazı tipleri projenin içindedir; internet olmadan da çalışır.

Kaldığın yer, ekranın üst kısmındaki bir çizgiye göre **sayfa + sayfa içi oran**
olarak saklanır. Kaydırma durduktan 1 sn sonra, sekme kapanırken ya da arka
plana geçerken (`sendBeacon`) kaydedilir. Farklı ekran boyutlarında da aynı satıra döner.

## Geliştirme (Windows + WSL)

```bash
# WSL içinde
cd /mnt/c/Users/<kullanıcı>/Documents/KitapOkur
KITAPOKUR_DATA=$HOME/kitapokur-data KITAPOKUR_DEV=1 ./run.sh
```

Windows'ta tarayıcıdan `http://localhost:8000` adresini aç. API belgeleri:
`http://localhost:8000/api/docs`.

> Veri klasörünü WSL'in kendi diskinde tut (`$HOME/...`). SQLite'ın WAL modu
> `/mnt/c` gibi Windows disklerinde güvenilir çalışmaz.

## Raspberry Pi 4'e kurulum

```bash
sudo apt install python3-venv
git clone <depo> ~/KitapOkur     # ya da klasörü kopyala
cd ~/KitapOkur
./run.sh                          # ilk çalıştırmada sanal ortamı kurar
```

Ev ağındaki diğer cihazlardan `http://raspberrypi.local:8000` adresine gir.

Açılışta otomatik başlatmak için:

```bash
sudo cp deploy/kitapokur.service /etc/systemd/system/
sudo nano /etc/systemd/system/kitapokur.service   # User ve yolları düzenle
sudo systemctl daemon-reload
sudo systemctl enable --now kitapokur
```

Öneriler:

- Veriyi SD kart yerine USB SSD'de tut: `KITAPOKUR_DATA=/mnt/ssd/kitapokur`.
- Dışarıdan erişim için port açmak yerine Tailscale kullan. Profillerde şifre
  yok; ağa erişen herkes her profile girebilir. Sadece güvendiğin ağlarda aç.

### Telefona uygulama olarak kurmak (PWA)

Okur ana ekrana eklenince tarayıcı çubukları olmadan, kendi simgesiyle tam ekran açılır.

- **iPhone (Safari):** Paylaş → *Ana Ekrana Ekle*. Düz `http://` adreste de çalışır.
- **Android (Chrome):** menü → *Ana ekrana ekle* / *Uygulamayı yükle*.

Tarayıcılar service worker'ı yalnızca HTTPS'te çalıştırır. Düz `http://raspberrypi.local:8000`
adresinde uygulama yine kurulur, ama sunucuya ulaşılamadığında açılmaz ve Android
onu bir uygulama yerine kısayol olarak ekleyebilir. Tam kurulum için en kolay yol Tailscale'in
HTTPS sertifikası:

```bash
sudo tailscale serve --bg 8000
# Artık https://<pi-adı>.<tailnet>.ts.net adresinden aç ve oradan kur.
```

HTTPS'te uygulama dosyaları telefonda önbelleğe alınır: Pi'ye ulaşılamazsa uygulama
yine açılır ve "Okur'a ulaşılamıyor" der. Kitaplar ve kartlar her zaman sunucudan gelir.

## Ayarlar (ortam değişkenleri)

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `KITAPOKUR_HOST` | `0.0.0.0` | Dinlenecek adres |
| `KITAPOKUR_PORT` | `8000` | Port |
| `KITAPOKUR_DATA` | `./data` | Veritabanı, PDF'ler, kapaklar |
| `KITAPOKUR_VENV` | `~/.venvs/kitapokur` | Python sanal ortamı |
| `KITAPOKUR_MAX_UPLOAD_MB` | `500` | Tek dosya sınırı |
| `KITAPOKUR_DEV` | `0` | `1` ise kod değişince sunucu yeniden başlar |
| `KITAPOKUR_TRANSLATOR` | `google-web` | `google-cloud` ise resmî API kullanılır |
| `KITAPOKUR_GOOGLE_API_KEY` | | Resmî API anahtarı |
| `KITAPOKUR_TATOEBA_AUTO` | `1` | `0` ise Tatoeba verisi otomatik indirilmez |
## Dosya yapısı

```
backend/app/
  main.py         API ve statik dosyalar
  processing.py   arka plan iş kuyruğu (sayfa boyutları, kapak, meta veri)
  words.py        kelime çıkarma, kök bulma, sıklık, kelime kutuları
  words_api.py    kelime paneli, seviye, kelime durumu, çeviri API'si
  translate.py    çeviri sağlayıcıları (Google web / Cloud)
  dictionary.py   tanım, IPA ve ses (Free Dictionary → Wiktionary)
  tatoeba.py      örnek cümle verisi (indirme, FTS5 arama)
  enrich.py       toplu çeviri işçisi, kelime ayrıntısı önbelleği
  study.py        FSRS zamanlama, günlük sınır, istatistik
  study_api.py    flashcard API'si
  cards_api.py    kart tarayıcısı ve elle kart ekleme
  forms.py        kelime biçimleri (V1/V2/V3, çoğul, dereceler)
  toc.py          içindekiler (PDF'in kendi listesi ya da bölüm başlıkları)  users.py        profiller ve profil seçimi
  db.py           SQLite bağlantısı ve şema göçleri
  config.py       ayarlar
  net.py          dış HTTP istekleri
frontend/
  profiles.html   "Kim okuyor?"
  index.html      kütüphane
  reader.html     okuyucu
  study.html      flashcard çalışma
  cards.html      kart tarayıcısı
  sw.js           service worker (PWA önbelleği)
  manifest.webmanifest, icons/
  js/             api.js, library.js, reader.js, panel.js, toc.js, study.js, cards.js, profiles.js
  css/            app.css (ortak), library.css, reader.css, study.css, cards.css, profiles.css
  vendor/         PDF.js 5.7.284 (legacy build), Literata ve IBM Plex Sans
deploy/kitapokur.service
run.sh
```

## Klavye kısayolları (okuyucu)

| Tuş | İşlev |
|---|---|
| ← / → | Önceki / sonraki sayfa |
| Home / End | İlk / son sayfa |
| Ctrl + / Ctrl − / Ctrl 0 | Yakınlaştır / uzaklaştır / sığdır |
| ← / → (panel sekmelerinde) | Sekmeler arasında geç |

## Bilinen sınırlar

- Taranmış (resim) PDF'ler okunur ama metin katmanı yoktur; kütüphanede
  "Taranmış PDF" olarak işaretlenir. Kelime özellikleri bu kitaplarda çalışmaz.
  Her sayfada tekrarlanan filigran satırları metin sayılmaz.
- Şifreli PDF'ler desteklenmiyor.
- Vurgulu kelimelerin üzerinde metin seçilemez (tıklama vurguya gider).
- Google'ın anahtarsız uç noktası resmî değildir; değişirse ya da sınıra takılırsa
  çeviri 10 dakikada bir yeniden denenir. Kalıcı çözüm için resmî API'ye geç.

## Lisanslar

Örnek cümleler [Tatoeba](https://tatoeba.org) (CC-BY 2.0 FR), tanımlar
[Wiktionary](https://en.wiktionary.org) (CC-BY-SA) kaynaklıdır. PDF.js Apache 2.0,
Literata ve IBM Plex Sans OFL lisanslıdır.
