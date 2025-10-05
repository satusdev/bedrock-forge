<?php
/**
 * Sample WordPress files for testing purposes.
 *
 * This file contains sample WordPress configuration and theme files
 * that can be used for testing deployment and backup functionality.
 */

// Sample wp-config.php content
$wp_config_content = '<?php
/**
 * WordPress configuration file
 */

// Database settings
define(\'DB_NAME\', \'test_database\');
define(\'DB_USER\', \'test_user\');
define(\'DB_PASSWORD\', \'test_password\');
define(\'DB_HOST\', \'localhost\');

// WordPress URLs
define(\'WP_HOME\', \'https://test.example.com\');
define(\'WP_SITEURL\', \'https://test.example.com\');

// Security keys
define(\'AUTH_KEY\', \'put your unique phrase here\');
define(\'SECURE_AUTH_KEY\', \'put your unique phrase here\');
define(\'LOGGED_IN_KEY\', \'put your unique phrase here\');
define(\'NONCE_KEY\', \'put your unique phrase here\');

// Debug mode
define(\'WP_DEBUG\', false);
define(\'WP_DEBUG_LOG\', false);
define(\'WP_DEBUG_DISPLAY\', false);

// Content directory
define(\'WP_CONTENT_DIR\', dirname(__FILE__) . \'/web/app\');

// Salts
define(\'NONCE_SALT\', \'put your unique phrase here\');

if (!defined(\'ABSPATH\')) {
    define(\'ABSPATH\', dirname(__FILE__) . \'/web/wp/\');
}

require_once(ABSPATH . \'wp-settings.php\');
';

// Sample theme style.css
$theme_style_css = '/*
Theme Name: Test Theme
Theme URI: https://example.com/test-theme
Author: Test Author
Author URI: https://example.com
Description: A test theme for unit testing
Version: 1.0.0
License: GNU General Public License v2 or later
License URI: http://www.gnu.org/licenses/gpl-2.0.html
Text Domain: test-theme
*/

/* Reset */
body, h1, h2, h3, p, ul, ol, li {
    margin: 0;
    padding: 0;
}

/* Base styles */
body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    line-height: 1.6;
    color: #333;
}

h1, h2, h3 {
    margin-bottom: 1rem;
}

a {
    color: #0073aa;
    text-decoration: none;
}

a:hover {
    text-decoration: underline;
}

/* Layout */
.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 20px;
}

.header {
    background: #fff;
    padding: 1rem 0;
    border-bottom: 1px solid #eee;
}

.main {
    padding: 2rem 0;
}

.footer {
    background: #333;
    color: #fff;
    padding: 2rem 0;
    text-align: center;
}
';

// Sample plugin file
$plugin_php = '<?php
/**
 * Plugin Name: Test Plugin
 * Plugin URI: https://example.com/test-plugin
 * Description: A test plugin for unit testing
 * Version: 1.0.0
 * Author: Test Author
 * Author URI: https://example.com
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: test-plugin
 */

// Prevent direct access
if (!defined(\'ABSPATH\')) {
    exit;
}

// Plugin main class
class TestPlugin {

    public function __construct() {
        add_action(\'init\', array($this, \'init\'));
    }

    public function init() {
        // Plugin initialization
        $this->load_textdomain();
        $this->setup_hooks();
    }

    private function load_textdomain() {
        load_plugin_textdomain(
            \'test-plugin\',
            false,
            dirname(plugin_basename(__FILE__)) . \'/languages\'
        );
    }

    private function setup_hooks() {
        // Setup plugin hooks
        add_action(\'wp_enqueue_scripts\', array($this, \'enqueue_scripts\'));
        add_shortcode(\'test_shortcode\', array($this, \'test_shortcode\'));
    }

    public function enqueue_scripts() {
        wp_enqueue_style(
            \'test-plugin-style\',
            plugin_dir_url(__FILE__) . \'assets/style.css\',
            array(),
            \'1.0.0\'
        );

        wp_enqueue_script(
            \'test-plugin-script\',
            plugin_dir_url(__FILE__) . \'assets/script.js\',
            array(\'jquery\'),
            \'1.0.0\',
            true
        );
    }

    public function test_shortcode($atts) {
        $atts = shortcode_atts(
            array(
                \'message\' => \'Hello from Test Plugin!\'
            ),
            $atts,
            \'test_shortcode\'
        );

        return \'<div class="test-plugin">\' . esc_html($atts[\'message\']) . \'</div>\';
    }
}

// Initialize plugin
new TestPlugin();
';

// Sample mu-plugin file
$mu_plugin_php = '<?php
/**
 * Plugin Name: Test MU Plugin
 * Plugin URI: https://example.com/test-mu-plugin
 * Description: A test must-use plugin for unit testing
 * Version: 1.0.0
 * Author: Test Author
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 */

// Prevent direct access
if (!defined(\'ABSPATH\')) {
    exit;
}

// Must-use plugin functionality
function test_mu_plugin_function() {
    // Test functionality that\'s always loaded
    return \'MU Plugin is active\';
}

// Add custom capability
add_action(\'init\', function() {
    if (!current_user_can(\'test_mu_capability\')) {
        // Add role capability if it doesn\'t exist
        $role = get_role(\'administrator\');
        if ($role) {
            $role->add_cap(\'test_mu_capability\');
        }
    }
});

// Custom admin notice
add_action(\'admin_notices\', function() {
    if (current_user_can(\'test_mu_capability\')) {
        echo \'<div class="notice notice-info is-dismissible">\';
        echo \'<p>Test MU Plugin is active and working!</p>\';
        echo \'</div>\';
    }
});

// Custom theme setup
add_action(\'after_setup_theme\', function() {
    // Test theme setup from MU plugin
    add_theme_support(\'post-thumbnails\');
    add_theme_support(\'custom-logo\');
});

// Sample custom function
function get_test_data() {
    return array(
        \'plugin_version\' => \'1.0.0\',
        \'mu_plugin_active\' => true,
        \'test_timestamp\' => current_time(\'mysql\')
    );
}
';

// Sample functions.php for theme
$functions_php = '<?php
/**
 * Test Theme functions
 */

// Theme setup
function test_theme_setup() {
    // Add theme supports
    add_theme_support(\'title-tag\');
    add_theme_support(\'post-thumbnails\');
    add_theme_support(\'html5\', array(
        \'search-form\',
        \'comment-form\',
        \'comment-list\',
        \'gallery\',
        \'caption\',
    ));

    // Register menu
    register_nav_menus(array(
        \'primary\' => \'Primary Menu\',
        \'footer\' => \'Footer Menu\',
    ));
}
add_action(\'after_setup_theme\', \'test_theme_setup\');

// Enqueue scripts and styles
function test_theme_scripts() {
    wp_enqueue_style(
        \'test-theme-style\',
        get_stylesheet_uri(),
        array(),
        wp_get_theme()->get(\'Version\')
    );

    wp_enqueue_script(
        \'test-theme-script\',
        get_template_directory_uri() . \'/assets/js/theme.js\',
        array(\'jquery\'),
        wp_get_theme()->get(\'Version\'),
        true
    );
}
add_action(\'wp_enqueue_scripts\', \'test_theme_scripts\');

// Register widget areas
function test_theme_widgets() {
    register_sidebar(array(
        \'name\'          => \'Primary Sidebar\',
        \'id\'            => \'sidebar-1\',
        \'before_widget\' => \'<section class="widget %2$s">\',
        \'after_widget\'  => \'</section>\',
        \'before_title\'  => \'<h2 class="widget-title">\',
        \'after_title\'   => \'</h2>\',
    ));

    register_sidebar(array(
        \'name\'          => \'Footer Widget Area\',
        \'id\'            => \'footer-widgets\',
        \'before_widget\' => \'<div class="footer-widget %2$s">\',
        \'after_widget\'  => \'</div>\',
        \'before_title\'  => \'<h3 class="footer-widget-title">\',
        \'after_title\'   => \'</h3>\',
    ));
}
add_action(\'widgets_init\', \'test_theme_widgets\');

// Customizer settings
function test_theme_customize_register($wp_customize) {
    $wp_customize->add_setting(\'header_color\', array(
        \'default\'           => \'#ffffff\',
        \'sanitize_callback\' => \'sanitize_hex_color\',
        \'transport\'         => \'postMessage\',
    ));

    $wp_customize->add_control(new WP_Customize_Color_Control($wp_customize, \'header_color\', array(
        \'label\'    => __(\'Header Color\', \'test-theme\'),
        \'section\'  => \'colors\',
        \'settings\' => \'header_color\',
    )));
}
add_action(\'customize_register\', \'test_theme_customize_register\');

// Custom template tags
function test_theme_posted_on() {
    $time_string = \'<time class="entry-date published updated" datetime="%1$s">%2$s</time>\';
    if (get_the_time(\'U\') !== get_the_modified_time(\'U\')) {
        $time_string = \'<time class="entry-date published" datetime="%1$s">%2$s</time><time class="updated" datetime="%3$s">%4$s</time>\';
    }

    $time_string = sprintf(
        $time_string,
        esc_attr(get_the_date(DATE_W3C)),
        esc_html(get_the_date()),
        esc_attr(get_the_modified_date(DATE_W3C)),
        esc_html(get_the_modified_date())
    );

    $posted_on = sprintf(
        /* translators: %s: post date */
        esc_html_x(\'Posted on %s\', \'post date\', \'test-theme\'),
        \'<a href="\' . esc_url(get_permalink()) . \'">\' . $time_string . \'</a>\'
    );

    echo \'<span class="posted-on">\' . $posted_on . \'</span>\';
}

// Helper function to get theme options
function test_theme_get_option($option_name, $default = \'\') {
    $options = get_option(\'test_theme_options\', array());
    return isset($options[$option_name]) ? $options[$option_name] : $default;
}
';

// Return all sample contents as array
return array(
    \'wp_config\' => $wp_config_content,
    \'theme_style\' => $theme_style_css,
    \'plugin_php\' => $plugin_php,
    \'mu_plugin_php\' => $mu_plugin_php,
    \'functions_php\' => $functions_php,
);