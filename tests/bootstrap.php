<?php
/**
 * PHPUnit Bootstrap
 */

require_once __DIR__ . '/../vendor/autoload.php';

// Define base path
if (!defined('BASE_PATH')) {
    define('BASE_PATH', dirname(__DIR__));
}

// Mock some global functions if they are missing or if needed by helpers
if (!function_exists('cleanInput')) {
    function cleanInput($data) {
        return htmlspecialchars(strip_tags(trim($data)));
    }
}

if (!function_exists('formatCustomDate')) {
    function formatCustomDate($format, $timestamp = null) {
        return date($format, $timestamp ?: time());
    }
}

if (!function_exists('getCurrentDateTimeObject')) {
    function getCurrentDateTimeObject() {
        return new DateTime();
    }
}

// Load helpers
require_once BASE_PATH . '/includes/wa_helper.php';
require_once BASE_PATH . '/includes/discord_helper.php';
