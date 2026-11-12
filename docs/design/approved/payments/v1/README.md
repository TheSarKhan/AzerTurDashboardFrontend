# Ödəniş və beh — dizayn v1

Status: istifadəçi tərəfindən təsdiqlənib. Bu şəkillər vizual maketdir; tətbiq ayrıca hazırlanır.

Operator beh məbləğini daxil edir; sonrakı xidmət ödənişləri ehtiyac olduqda ayrıca tələb edilir. Müqavilə təsdiqi ödənişdən əvvəl gəlir. Göstərilən qiymətlər, ödəniş məbləğləri və statuslar nümunədir. Epoint üçün real inteqrasiya və merchant hesabı hələ hazır deyil.

- operator-desktop.png: operatorun ödəniş tələbi hazırlaması.
- customer-desktop.png: müştərinin beh və sonrakı xidmət ödənişlərinə baxışı.
- customer-mobile-refined.png: mobil ümumi görünüş və nəticəsi yoxlanan ödənişin ayrı vəziyyəti. İlk variant da saxlanılıb.

Uğursuz və qeyri-müəyyən nəticələrdə faktiki ödəniş statusu provayderdən təsdiqlənməlidir; avtomatik yeni cəhd ikiqat tutulma yaratmamalıdır. Nümunə maketdə yaradılmış hər hansı konkret ödəniş tarixi, komissiya, faiz, köçürmə və ya hüquqi mətn məhsul qaydası sayılmır. Təsdiqdən sonra tətbiq EN/RU/AZ dillərində hazırlanacaq.

Vizual istinad: layihənin təsdiqlənmiş müştəri kabineti və operator təklifi. Araşdırma: https://www.appetiteui.com/docs/screens-booking və https://figr.design/templates/travel-booking-checkout. Figma faylı yaradılmayıb.

Maketdəki “remaining after request” €345, yalnız €150 uğurla ödənərsə yaranan proqnozdur; hazırkı qalıq €495-dir. Mobil yoxlama vəziyyətində €0 yalnız son təsdiqlənmiş ödənişi göstərir; provayder statusu bilinmədən yenidən cəhd açılmamalıdır. Tam səhifəli mobil maketin alt hissəsi generasiyada kəsilib; footer tətbiqdə mövcud sayt footer-i ilə tamamlanmalıdır.
