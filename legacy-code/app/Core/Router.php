<?php

declare(strict_types=1);

namespace App\Core;

class Router
{
    private array $routes = [];

    public function get(string $path, array $handler, bool $auth = false): void
    {
        $this->register('GET', $path, $handler, $auth);
    }

    public function post(string $path, array $handler, bool $auth = false): void
    {
        $this->register('POST', $path, $handler, $auth);
    }

    private function register(string $method, string $path, array $handler, bool $auth): void
    {
        $this->routes[$method][$path] = ['handler' => $handler, 'auth' => $auth];
    }

    public function dispatch(string $method, string $uri): void
    {
        $path = parse_url($uri, PHP_URL_PATH) ?: '/';
        $basePath = parse_url($_ENV['APP_URL'] ?? '', PHP_URL_PATH) ?: '';

        if ($basePath !== '' && str_starts_with($path, $basePath)) {
            $path = substr($path, strlen($basePath)) ?: '/';
        }

        $route = $this->routes[$method][$path] ?? null;
        if (!$route) {
            http_response_code(404);
            echo '404 Not Found';
            return;
        }

        if ($route['auth'] && !Session::has('user')) {
            redirect('/login');
        }

        [$class, $action] = $route['handler'];
        $controller = new $class();
        $controller->{$action}();
    }
}
