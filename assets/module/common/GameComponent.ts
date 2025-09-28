/*
 * @Author: dgflash
 * @Date: 2022-04-14 17:08:01
 * @LastEditors: dgflash
 * @LastEditTime: 2022-12-13 11:36:00
 */
import { Asset, Button, Component, EventHandler, EventKeyboard, EventTouch, Input, Node, Sprite, SpriteFrame, __private, _decorator, input, isValid } from "cc";
import { oops } from "../../core/Oops";
import { AudioEffect } from "../../core/common/audio/AudioEffect";
import { IAudioParams } from "../../core/common/audio/IAudio";
import { EventDispatcher } from "../../core/common/event/EventDispatcher";
import { EventMessage, ListenerFunc } from "../../core/common/event/EventMessage";
import { AssetType, CompleteCallback, Paths, ProgressCallback, resLoader } from "../../core/common/loader/ResLoader";
import { ViewUtil } from "../../core/utils/ViewUtil";

const { ccclass } = _decorator;

/** 加载资源类型 */
enum ResType {
    Load,
    LoadDir
}

/** 资源加载记录 */
interface ResRecord {
    /** 资源包名 */
    bundle: string,
    /** 资源路径 */
    path: string,
    /** 引用计数 */
    refCount: number,
    /** 资源编号 */
    resId?: number
}

/**
 * 游戏显示对象组件模板
 * 1、当前对象加载的资源，会在对象释放时，自动释放引用的资源
 * 2、当前对象支持启动游戏引擎提供的各种常用逻辑事件
 */
@ccclass("GameComponent")
export class GameComponent extends Component {
    //#region 全局事件管理
    private _event: EventDispatcher | null = null;
    /** 全局事件管理器 */
    private get event(): EventDispatcher {
        if (this._event == null) this._event = new EventDispatcher();
        return this._event;
    }

    /**
     * 注册全局事件
     * @param event       事件名
     * @param listener    处理事件的侦听器函数
     * @param object      侦听函数绑定的this对象
     */
    on(event: string, listener: ListenerFunc, object: any) {
        this.event.on(event, listener, object);
    }

    /**
     * 移除全局事件
     * @param event      事件名
     */
    off(event: string) {
        this.event.off(event);
    }

    /**
     * 触发全局事件
     * @param event      事件名
     * @param args       事件参数
     */
    dispatchEvent(event: string, ...args: any) {
        this.event.dispatchEvent(event, ...args);
    }
    //#endregion

    //#region 预制节点管理

    /** 摊平的节点集合（所有节点不能重名） */
    nodes: Map<string, Node> = null!;

    /** 通过节点名获取预制上的节点，整个预制不能有重名节点 */
    getNode(name: string): Node | undefined {
        if (this.nodes) {
            return this.nodes.get(name);
        }
        return undefined;
    }

    /** 平摊所有节点存到Map<string, Node>中通过get(name: string)方法获取 */
    nodeTreeInfoLite() {
        this.nodes = new Map();
        ViewUtil.nodeTreeInfoLite(this.node, this.nodes);
    }

    /**
     * 从资源缓存中找到预制资源名并创建一个显示对象
     * @param path 资源路径
     */
    createPrefabNode(path: string, bundleName: string = oops.res.defaultBundleName): Node {
        return ViewUtil.createPrefabNode(path, bundleName);
    }
    //#endregion

    //#region 资源加载管理
    /** 资源路径 */
    private resPaths: Map<ResType, Map<string, ResRecord>> = null!;             // 资源使用记录

    /**
     * 获取资源
     * @param path          资源路径
     * @param type          资源类型
     * @param bundleName    远程资源包名
     */
    getRes<T extends Asset>(path: string, type?: __private.__types_globals__Constructor<T> | null, bundleName?: string): T | null {
        return oops.res.get(path, type, bundleName);
    }

    /**
     * 添加资源使用记录
     * @param type          资源类型
     * @param bundleName    资源包名
     * @param paths         资源路径
     */
    private addPathToRecord<T>(type: ResType, bundleName: string, paths?: string | string[] | AssetType<T> | ProgressCallback | CompleteCallback | null) {
        if (this.resPaths == null) this.resPaths = new Map();

        var rps = this.resPaths.get(type);
        if (rps == null) {
            rps = new Map();
            this.resPaths.set(type, rps);
        }

        if (paths instanceof Array) {
            let realBundle = bundleName;
            for (let index = 0; index < paths.length; index++) {
                let realPath = paths[index];
                let key = this.getResKey(realBundle, realPath);
                let rp = rps.get(key);
                if (rp) {
                    rp.refCount++;
                }
                else {
                    rps.set(key, { path: realPath, bundle: realBundle, refCount: 1 });
                }
            }
        }
        else if (typeof paths === "string") {
            let realBundle = bundleName;
            let realPath = paths;
            let key = this.getResKey(realBundle, realPath);
            let rp = rps.get(key);
            if (rp) {
                rp.refCount++;
            }
            else {
                rps.set(key, { path: realPath, bundle: realBundle, refCount: 1 });
            }
        }
        else {
            let realBundle = oops.res.defaultBundleName;
            let realPath = bundleName;
            let key = this.getResKey(realBundle, realPath);
            let rp = rps.get(key);
            if (rp) {
                rp.refCount++;
            }
            else {
                rps.set(key, { path: realPath, bundle: realBundle, refCount: 1 });
            }
        }
    }

    private getResKey(realBundle: string, realPath: string): string {
        let key = `${realBundle}:${realPath}`;
        return key;
    }

    /**
     * 加载一个资源
     * @param bundleName    远程包名
     * @param paths         资源路径
     * @param type          资源类型
     * @param onProgress    加载进度回调
     */
    load<T extends Asset>(bundleName: string, paths: Paths | AssetType<T>, type?: AssetType<T>) {
        this.addPathToRecord(ResType.Load, bundleName, paths);
        return oops.res.load(bundleName, paths, type);
    }

    /**
     * 加载指定资源包中的多个任意类型资源
     * @param bundleName    远程包名
     * @param paths         资源路径
     * @param onProgress    加载进度回调
     * @param onComplete    加载完成回调
     */
    loadAny(bundleName: string | string[], paths: string[] | ProgressCallback, onProgress?: ProgressCallback | CompleteCallback, onComplete?: CompleteCallback): void {
        if (typeof bundleName === "string" && paths instanceof Array) {
            this.addPathToRecord(ResType.Load, bundleName, paths);
        }
        else {
            this.addPathToRecord(ResType.Load, resLoader.defaultBundleName, bundleName);
        }
        oops.res.loadAny(bundleName, paths, onProgress, onComplete);
    }

    /**
     * 加载文件夹中的资源
     * @param bundleName    远程包名
     * @param dir           文件夹名
     * @param type          资源类型
     * @param onProgress    加载进度回调
     * @param onComplete    加载完成回调
     */
    loadDir<T extends Asset>(bundleName: string, dir: string, type: AssetType<T>, onProgress: ProgressCallback, onComplete: CompleteCallback): void;
    loadDir<T extends Asset>(bundleName: string, dir: string, onProgress: ProgressCallback, onComplete: CompleteCallback): void;
    loadDir<T extends Asset>(bundleName: string, dir: string, onComplete?: CompleteCallback): void;
    loadDir<T extends Asset>(bundleName: string, dir: string, type: AssetType<T>, onComplete?: CompleteCallback): void;
    loadDir<T extends Asset>(dir: string, type: AssetType<T>, onProgress: ProgressCallback, onComplete: CompleteCallback): void;
    loadDir<T extends Asset>(dir: string, onProgress: ProgressCallback, onComplete: CompleteCallback): void;
    loadDir<T extends Asset>(dir: string, onComplete?: CompleteCallback): void;
    loadDir<T extends Asset>(dir: string, type: AssetType<T>, onComplete?: CompleteCallback): void;
    loadDir<T extends Asset>(
        bundleName: string,
        dir?: string | AssetType<T> | ProgressCallback | CompleteCallback,
        type?: AssetType<T> | ProgressCallback | CompleteCallback,
        onProgress?: ProgressCallback | CompleteCallback,
        onComplete?: CompleteCallback,
    ) {
        let realDir: string;
        let realBundle: string;
        if (typeof dir === "string") {
            realDir = dir;
            realBundle = bundleName;
        }
        else {
            realDir = bundleName;
            realBundle = oops.res.defaultBundleName;
        }

        this.addPathToRecord(ResType.LoadDir, realBundle, realDir);
        oops.res.loadDir(bundleName, dir, type, onProgress, onComplete);
    }

    /** 释放资源 */
    release() {
        if (this.resPaths) {
            const rps = this.resPaths.get(ResType.Load);
            if (rps) {
                rps.forEach((value: ResRecord) => {
                    for (let i = 0; i < value.refCount; i++) {
                        oops.res.release(value.path, value.bundle);
                    }
                });
                rps.clear();
            }
        }
    }

    /** 释放文件夹的资源 */
    releaseDir() {
        if (this.resPaths) {
            const rps = this.resPaths.get(ResType.LoadDir);
            if (rps) {
                rps.forEach((value: ResRecord) => {
                    oops.res.releaseDir(value.path, value.bundle);
                });
            }
        }
    }

    /**
     * 设置图片资源
     * @param target  目标精灵对象
     * @param path    图片资源地址
     * @param bundle  资源包名
     */
    async setSprite(target: Sprite, path: string, bundle: string = resLoader.defaultBundleName) {
        const spriteFrame = await this.load(bundle, path, SpriteFrame);
        if (!spriteFrame || !isValid(target)) {
            const rps = this.resPaths.get(ResType.Load);
            if (rps) {
                const key = this.getResKey(bundle, path);
                rps.delete(key);
                oops.res.release(path, bundle);
            }
            return;
        }
        spriteFrame.addRef();
        target.spriteFrame = spriteFrame;
    }
    //#endregion

    //#region 音频播放管理
    /**
     * 播放背景音乐（不受自动释放资源管理）
     * @param url           资源地址
     * @param params        背景音乐资源播放参数
     */
    playMusic(url: string, params?: IAudioParams) {
        oops.audio.music.loadAndPlay(url, params);
    }

    /**
     * 播放音效
     * @param url           资源地址
     * @param params        音效播放参数
     */
    playEffect(url: string, params?: IAudioParams): Promise<AudioEffect> {
        return new Promise(async (resolve, reject) => {
            // 音效播放完，关闭正在播放状态的音乐效果
            if (params == null) {
                params = { bundle: resLoader.defaultBundleName };
            }
            else if (params.bundle == null) {
                params.bundle = resLoader.defaultBundleName;
            }
            let ae = await oops.audio.playEffect(url, params);
            if (ae) {
                this.addPathToRecord(ResType.Load, ae.params.bundle!, url);
                resolve(ae);
            }
            else {
                resolve(null!);
            }
        });
    }
    //#endregion

    //#region 游戏逻辑事件
    /**
     * 批量设置当前界面按钮事件
     * @param bindRootEvent  是否对预制根节点绑定触摸事件
     * @example
     * 注：按钮节点Label1、Label2必须绑定UIButton等类型的按钮组件才会生效，方法名必须与节点名一致
     * this.setButton();
     *
     * Label1(event: EventTouch) { console.log(event.target.name); }
     * Label2(event: EventTouch) { console.log(event.target.name); }
     */
    protected setButton(bindRootEvent: boolean = true) {
        // 自定义按钮批量绑定触摸事件
        if (bindRootEvent) {
            this.node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
                const self: any = this;
                const func = self[event.target.name];
                if (func) {
                    func.call(this, event);
                }
                // 不触发界面根节点触摸事件、不触发长按钮组件的触摸事件
                // else if (event.target != this.node && event.target.getComponent(ButtonTouchLong) == null) {
                //     console.warn(`名为【${event.target.name}】的按钮事件方法不存在`);
                // }
            }, this);
        }

        // Cocos Creator Button组件批量绑定触摸事件（使用UIButton支持放连点功能）
        const regex = /<([^>]+)>/;
        const buttons = this.node.getComponentsInChildren<Button>(Button);
        buttons.forEach((b: Button) => {
            const node = b.node;
            const self: any = this;
            const func = self[node.name];
            if (func) {
                const event = new EventHandler();
                event.target = this.node;
                event.handler = b.node.name;
                event.component = this.name.match(regex)![1];
                b.clickEvents.push(event);
            }
            // else {
            //     console.warn(`名为【${node.name}】的按钮事件方法不存在`);
            // }
        });
    }

    /**
     * 批量设置全局事件
     * @example
     *  this.setEvent("onGlobal");
     *  this.dispatchEvent("onGlobal", "全局事件");
     *
     *  onGlobal(event: string, args: any) { console.log(args) };
     */
    protected setEvent(...args: string[]) {
        const self: any = this;
        for (const name of args) {
            const func = self[name];
            if (func)
                this.on(name, func, this);
            else
                console.error(`名为【${name}】的全局事方法不存在`);
        }
    }

    /**
     * 键盘事件开关
     * @param on 打开键盘事件为true
     */
    setKeyboard(on: boolean) {
        if (on) {
            input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
            input.on(Input.EventType.KEY_UP, this.onKeyUp, this);
            input.on(Input.EventType.KEY_PRESSING, this.onKeyPressing, this);
        }
        else {
            input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
            input.off(Input.EventType.KEY_UP, this.onKeyUp, this);
            input.off(Input.EventType.KEY_PRESSING, this.onKeyPressing, this);
        }
    }

    /** 键按下 */
    protected onKeyDown(event: EventKeyboard) { }

    /** 键放开 */
    protected onKeyUp(event: EventKeyboard) { }

    /** 键长按 */
    protected onKeyPressing(event: EventKeyboard) { }

    /** 监听游戏从后台进入事件 */
    protected setGameShow() {
        this.on(EventMessage.GAME_SHOW, this.onGameShow, this);
    }

    /** 监听游戏切到后台事件 */
    protected setGameHide() {
        this.on(EventMessage.GAME_HIDE, this.onGameHide, this);
    }

    /** 监听游戏画笔尺寸变化事件 */
    protected setGameResize() {
        this.on(EventMessage.GAME_RESIZE, this.onGameResize, this);
    }

    /** 监听游戏全屏事件 */
    protected setGameFullScreen() {
        this.on(EventMessage.GAME_FULL_SCREEN, this.onGameFullScreen, this);
    }

    /** 监听游戏旋转屏幕事件 */
    protected setGameOrientation() {
        this.on(EventMessage.GAME_ORIENTATION, this.onGameOrientation, this);
    }

    /** 游戏从后台进入事件回调 */
    protected onGameShow(): void { }

    /** 游戏切到后台事件回调 */
    protected onGameHide(): void { }

    /** 游戏画笔尺寸变化事件回调 */
    protected onGameResize(): void { }

    /** 游戏全屏事件回调 */
    protected onGameFullScreen(): void { }

    /** 游戏旋转屏幕事件回调 */
    protected onGameOrientation(): void { }
    //#endregion

    /** 移除自己 */
    remove() {
        oops.gui.removeByNode(this.node);
    }

    protected onDestroy() {
        // 释放消息对象
        if (this._event) {
            this._event.destroy();
            this._event = null;
        }

        // 节点引用数据清除
        if (this.nodes) {
            this.nodes.clear();
            this.nodes = null!;
        }

        // 自动释放资源
        if (this.resPaths) {
            this.release();
            this.releaseDir();
            this.resPaths.clear();
            this.resPaths = null!;
        }
    }
}