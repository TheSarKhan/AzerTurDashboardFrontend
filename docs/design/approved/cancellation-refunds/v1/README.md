# Ləğv və geri qaytarılma — dizayn v1

Status: istifadəçi tərəfindən təsdiqlənib. Bu PNG faylları təsdiqlənmiş maketlərdir; implementation-* faylları tətbiqin real görüntüləridir.

Ardıcıllıq: tam dizayn → istifadəçi təsdiqi → tətbiq → yoxlama.
İstifadəçi 2026-11-02 tarixində bu ardıcıllığı yenidən tələb etdi. Əvvəl hazırlanmış backend dizaynın təsdiqi hesab edilmir.

## Ekranlar

- operator-review-desktop.png — ödənmiş məbləğin xidmətlər arasında bölgüsü, təchizatçı və vaxt qaydalarının yoxlanması, müştəri izahı və daxili qeydlər.
- customer-request-desktop.png — bütöv səfər və ya seçilmiş xidmətlər üzrə ləğv sorğusu; məbləğ əvvəlcədən vəd edilmir.
- customer-result-desktop-refined.png — qərar, xidmətlər üzrə məbləğin izahı və geri ödənişin ayrıca statusu.
- customer-mobile-refined.png — ilk sorğu və sonrakı nəticə üçün iki fərqli mobil ekran.
- İlk generasiya variantları da dəyişdirilmədən saxlanılıb.

## Nümunə rəqəmlər

Səfər qiyməti €495, qəbul olunmuş ödəniş €200.
Ödənmiş pay / saxlanılan / qaytarılacaq: sürücü 80/20/60, otel 60/6/54, gid 40/20/20, transfer 10/0/10, fəaliyyət 10/0/10.
Cəm: €200 / €46 / €154.
Rəqəmlər, siyasətlər və təchizatçı məlumatları yalnız dizayn nümunəsidir.

## Davranış

Behin xidmətlərə bölgüsünü operator edir. Qayda müştəri sorğusunun vaxtına, xidmətin başlanma vaxtına və təchizatçının razılaşdırılmış siyasətinə əsaslanır. Vahid 48–72 saat və ya ümumi geri ödəmə faizi yoxdur. Şərtlər yoxlanılmayıbsa yekun təsdiq deaktiv olur. Müştəriyə daxili qeydlər çıxarılmır.

Sorğu göndərilməsi dərhal ləğv və ya geri ödəniş demək deyil. Ləğvin təsdiqi, geri ödənişin hazırlanması və pulun faktiki qaytarılması ayrı statuslardır. İlkin sorğuda məbləğ qiymətləndirmədən əvvəl göstərilmir. Yüklənən ləğv xülasəsi geri ödəniş qəbzi deyil.

Qismən xidmət ləğvi təsdiqdən sonra tətbiqə əlavə edilib; cari davranış və yoxlamalar implementation.md faylında qeyd olunub. Maketdəki düymə rəngindəki çox zəif işıq effekti gradient tələbi deyil; tətbiqdə düz rəng istifadə olunmalıdır. Ekranlarda EN göstərilir, tətbiq EN/RU/AZ olacaq.

## İstinadlar

Əsas vizual istinadlar layihənin təsdiqlənmiş müştəri kabineti və operator təklifi ekranlarıdır. Xarici axtarış istinadları:
https://figr.design/templates/travel-cancellation-rebooking
https://www.behance.net/gallery/184564973/Airify-Flight-Booking-App-UI-Kit-(Travel-App)
Xarici fayllar köçürülməyib. Redaktə olunan Figma faylı yaradılmayıb.
