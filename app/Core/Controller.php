<?php

declare(strict_types=1);

namespace App\Core;

abstract class Controller
{
    protected function view(string $view, array $data = [], string $layout = 'app'): void
    {
        extract($data, EXTR_SKIP);
        $viewFile = BASE_PATH . '/app/Views/' . $view . '.php';

        if (!file_exists($viewFile)) {
            throw new \RuntimeException("View {$view} not found");
        }

        if ($layout === 'none') {
            require $viewFile;
            return;
        }

        require BASE_PATH . '/app/Views/layouts/header.php';
        require BASE_PATH . '/app/Views/layouts/sidebar.php';
        require $viewFile;
        require BASE_PATH . '/app/Views/layouts/footer.php';
    }

    protected function json(array $payload, int $statusCode = 200): void
    {
        http_response_code($statusCode);
        header('Content-Type: application/json');
        echo json_encode($payload);
    }

    protected function input(string $key, mixed $default = null): mixed
    {
        return $_POST[$key] ?? $_GET[$key] ?? $default;
    }
}
