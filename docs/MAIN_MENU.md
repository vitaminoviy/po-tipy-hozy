# Главное меню Quiet Home

Главный экран заменяет короткую стартовую заставку. MainMenu.tsx отвечает за
декоративный экран, панели и переход; ProgressApp.tsx сохраняет владение IndexedDB.
New Game записывает новый мир атомарно после подтверждения замены. Ошибка записи
оставляет прежнее сохранение. Continue не записывает мир. Повреждённое сохранение
не удаляется: вход заблокирован и показано сообщение с предложением перезагрузки.

Игра монтируется после выбора; готовность Canvas и моделей проверяется до fade-out.
До этого мир inert; меню не пропускает клавиши игровым обработчикам. Настройка
анимации относится только к меню и действует до закрытия страницы. Панели используют
native dialog, Escape и восстановление фокуса. Exit не пытается закрывать обычную
вкладку автоматически — браузеры это ограничивают.

Фон: public/images/workshop-menu.png, 2 038 729 байт. Это производная приложенного
пользователем изображения «Тихий дом_ уютная мастерская на закате.png», подготовленная
встроенным image_gen. Исходные надписи убраны; текст меню теперь настоящий HTML.
Путь /mnt/data из запроса на Windows отсутствовал, использован приложенный файл
из Downloads. Исходник пользователя не изменён.

Точный запрос редактирования:

> Edit this image into a clean game main menu background plate. Remove ALL lettering: Quiet Home, Play, Continue, Settings, Credits, Exit, decorative flourishes and divider lines. Seamlessly restore the dark wooden shelves and workshop behind those letters. Preserve the original entire composition, miniature illuminated house at right, sunset window, warm lighting, plants, desk, depth of field, and dark left space. No new text, no logos, no UI. Keep wide 16:9 composition. Save output as a local image for game integration.

Движение: медленный CSS transform фонового слоя, изменение прозрачности тёплого
света и девять небольших частиц. Анимации отключаются через Settings либо системное
prefers-reduced-motion. Фон — иллюстрация, не отдельная интерактивная 3D-комната.
Реальные телефоны и Telegram WebView пока не проверены.

Проверки: tests/e2e/main-menu.spec.ts — запуск, hover, Settings/Credits/Exit,
New Game, Continue, подтверждение/отмена сброса, ошибка записи, delayed GLB,
reduced-motion, четыре размера окна. Снимки: artifacts/menu/desktop.png и 390.png.
Прежние тесты автоматического исчезновения splash заменены сценариями главного меню.
При ручном запуске прежних игровых сценариев теперь нужно сначала выбрать
New Game или Continue; полная тяжёлая регрессия в этом этапе не выполнялась.
