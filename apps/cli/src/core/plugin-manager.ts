/**
 * Plugin management system for extensibility
 */

import { pathToFileURL } from 'url';
import { join, resolve } from 'path';
import { access, readdir, constants } from 'fs/promises';

import {
  Plugin,
  EventType,
  PluginType,
  EventHandler,
  PluginContext,
  ServiceAdapter,
  CommandContext,
  CommandDefinition,
} from '../types/index.js';

export interface PluginManagerOptions {
  pluginPaths?: string[];
  autoLoad?: boolean;
}

export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private pluginPaths: string[];
  private commandRegistry: Map<string, CommandDefinition> = new Map();
  private serviceRegistry: Map<string, ServiceAdapter> = new Map();
  private uiRegistry: Map<string, React.ComponentType> = new Map();
  private hookRegistry: Map<EventType, Set<EventHandler>> = new Map();
  private context: CommandContext;

  constructor(context: CommandContext, options: PluginManagerOptions = {}) {
    this.context = context;
    this.pluginPaths = options.pluginPaths || [
      './plugins',
      join(process.env['HOME'] || '~', '.supastorj', 'plugins'),
    ];
  }

  /**
   * Initialize plugin manager and load plugins
   */
  async initialize(): Promise<void> {
    // Auto-discover and load plugins
    await this.discoverPlugins();
  }

  /**
   * Load a plugin
   */
  async loadPlugin(pluginPath: string): Promise<void> {
    try {
      // Import the plugin module
      const pluginUrl = pathToFileURL(resolve(pluginPath)).href;
      const pluginModule = await import(pluginUrl);
      
      // Get the default export or named export 'plugin'
      const plugin: Plugin = pluginModule.default || pluginModule.plugin;
      
      if (!plugin) {
        throw new Error(`No valid plugin export found in ${pluginPath}`);
      }

      // Validate plugin
      this.validatePlugin(plugin);

      // Check if plugin is already loaded
      if (this.plugins.has(plugin.name)) {
        this.context.logger.warn(`Plugin ${plugin.name} is already loaded`);
        return;
      }

      // Create plugin context
      const pluginContext = this.createPluginContext(plugin);

      // Initialize plugin
      await plugin.init(pluginContext);

      // Register plugin
      this.plugins.set(plugin.name, plugin);

      this.context.logger.info(`Loaded plugin: ${plugin.name} v${plugin.version}`);
      this.context.eventBus.emit(EventType.PluginLoad, { name: plugin.name });
    } catch (error) {
      this.context.logger.error(`Failed to load plugin from ${pluginPath}:`, error);
      throw error;
    }
  }

  /**
   * Unload a plugin
   */
  async unloadPlugin(pluginName: string): Promise<void> {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginName}`);
    }

    // Call plugin destroy method if available
    if (plugin.destroy) {
      await plugin.destroy();
    }

    // Remove plugin registrations
    this.removePluginRegistrations(pluginName);

    // Remove from loaded plugins
    this.plugins.delete(pluginName);

    this.context.logger.info(`Unloaded plugin: ${pluginName}`);
    this.context.eventBus.emit(EventType.PluginUnload, { name: pluginName });
  }

  /**
   * Get loaded plugins
   */
  getPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get plugin by name
   */
  getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * Get registered commands
   */
  getCommands(): CommandDefinition[] {
    return Array.from(this.commandRegistry.values());
  }

  /**
   * Get command by name
   */
  getCommand(name: string): CommandDefinition | undefined {
    return this.commandRegistry.get(name);
  }

  /**
   * Get registered services
   */
  getServices(): ServiceAdapter[] {
    return Array.from(this.serviceRegistry.values());
  }

  /**
   * Get service by name
   */
  getService(name: string): ServiceAdapter | undefined {
    return this.serviceRegistry.get(name);
  }

  /**
   * Discover plugins in configured paths
   */
  private async discoverPlugins(): Promise<void> {
    for (const pluginPath of this.pluginPaths) {
      try {
        // Check if path exists
        await access(pluginPath, constants.R_OK);
        
        // Read directory contents
        const entries = await readdir(pluginPath, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.isDirectory()) {
            // Look for index.js or plugin.js in the directory
            const possibleFiles = ['index.js', 'plugin.js'];
            for (const file of possibleFiles) {
              const fullPath = join(pluginPath, entry.name, file);
              try {
                await access(fullPath, constants.R_OK);
                await this.loadPlugin(fullPath);
                break;
              } catch {
                // File doesn't exist, try next
              }
            }
          } else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
            // Load JavaScript files as plugins
            const fullPath = join(pluginPath, entry.name);
            await this.loadPlugin(fullPath);
          }
        }
      } catch (error) {
        // Plugin path doesn't exist or isn't readable
        this.context.logger.debug(`Plugin path not accessible: ${pluginPath}`);
      }
    }
  }

  /**
   * Validate plugin structure
   */
  private validatePlugin(plugin: Plugin): void {
    if (!plugin.name || typeof plugin.name !== 'string') {
      throw new Error('Plugin must have a valid name');
    }

    if (!plugin.version || typeof plugin.version !== 'string') {
      throw new Error('Plugin must have a valid version');
    }

    if (!plugin.type || !Object.values(PluginType).includes(plugin.type)) {
      throw new Error('Plugin must have a valid type');
    }

    if (typeof plugin.init !== 'function') {
      throw new Error('Plugin must have an init function');
    }
  }

  /**
   * Create plugin context
   */
  private createPluginContext(plugin: Plugin): PluginContext {
    const context: PluginContext = {
      ...this.context,
    };

    // Add registration methods based on plugin type
    switch (plugin.type) {
      case PluginType.Command:
        context.registerCommand = (command: CommandDefinition) => {
          this.registerCommand(plugin.name, command);
        };
        break;

      case PluginType.Service:
        context.registerService = (service: ServiceAdapter) => {
          this.registerService(plugin.name, service);
        };
        break;

      case PluginType.UI:
        context.registerUI = (component: React.ComponentType) => {
          this.registerUI(plugin.name, component);
        };
        break;

      case PluginType.Hook:
        context.registerHook = (event: EventType, handler: EventHandler) => {
          this.registerHook(plugin.name, event, handler);
        };
        break;
        
      default:
        this.context.logger.warn(`Unknown plugin type: ${plugin.type}`);
        break;
    }

    return context;
  }

  /**
   * Register a command
   */
  private registerCommand(pluginName: string, command: CommandDefinition): void {
    if (this.commandRegistry.has(command.name)) {
      throw new Error(`Command already registered: ${command.name}`);
    }

    this.commandRegistry.set(command.name, {
      ...command,
      // Tag the command with the plugin name for cleanup
      action: async (context: CommandContext, ...args: any[]) => {
        try {
          await command.action(context, ...args);
        } catch (error) {
          context.logger.error(`Error in command ${command.name} from plugin ${pluginName}:`, error);
          throw error;
        }
      },
    });

    this.context.logger.debug(`Registered command: ${command.name} from plugin ${pluginName}`);
  }

  /**
   * Register a service
   */
  private registerService(pluginName: string, service: ServiceAdapter): void {
    if (this.serviceRegistry.has(service.name)) {
      throw new Error(`Service already registered: ${service.name}`);
    }

    this.serviceRegistry.set(service.name, service);
    this.context.logger.debug(`Registered service: ${service.name} from plugin ${pluginName}`);
  }

  /**
   * Register a UI component
   */
  private registerUI(pluginName: string, component: React.ComponentType): void {
    const componentName = component.displayName || component.name || pluginName;
    if (this.uiRegistry.has(componentName)) {
      throw new Error(`UI component already registered: ${componentName}`);
    }

    this.uiRegistry.set(componentName, component);
    this.context.logger.debug(`Registered UI component: ${componentName} from plugin ${pluginName}`);
  }

  /**
   * Register a hook
   */
  private registerHook(pluginName: string, event: EventType, handler: EventHandler): void {
    if (!this.hookRegistry.has(event)) {
      this.hookRegistry.set(event, new Set());
    }

    this.hookRegistry.get(event)!.add(handler);
    this.context.eventBus.on(event, handler);
    this.context.logger.debug(`Registered hook for event: ${event} from plugin ${pluginName}`);
  }

  /**
   * Remove all registrations for a plugin
   */
  private removePluginRegistrations(pluginName: string): void {
    // Remove commands
    for (const [name, command] of this.commandRegistry) {
      // Note: In a real implementation, we'd track which plugin registered which command
      // For now, we'll skip this cleanup
    }

    // Remove services
    for (const [name, service] of this.serviceRegistry) {
      // Note: In a real implementation, we'd track which plugin registered which service
      // For now, we'll skip this cleanup
    }

    // Remove UI components
    for (const [name, component] of this.uiRegistry) {
      // Note: In a real implementation, we'd track which plugin registered which component
      // For now, we'll skip this cleanup
    }

    // Remove hooks
    for (const [event, handlers] of this.hookRegistry) {
      // Note: In a real implementation, we'd track which plugin registered which handler
      // For now, we'll skip this cleanup
    }
  }
}