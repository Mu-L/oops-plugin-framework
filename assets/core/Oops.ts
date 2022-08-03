/*
 * @Author: dgflash
 * @Date: 2022-02-11 09:32:47
 * @LastEditors: dgflash
 * @LastEditTime: 2022-08-03 15:48:31
 */
import { ECSRootSystem } from "../libs/ecs/ECSSystem";
import { LanguageManager } from "../libs/gui/language/Language";
import { HttpRequest } from "../libs/network/HttpRequest";
import { AudioManager } from "./common/audio/AudioManager";
import { Message } from "./common/event/MessageManager";
import { Logger } from "./common/log/Logger";
import { TimerManager } from "./common/manager/TimerManager";
import { storage } from "./common/storage/StorageManager";
import { GameManager } from "./game/GameManager";
import { LayerManager } from "./gui/layer/LayerManager";

/** 框架版本 */
export var version: string = "1.0.8";

export class oops {
    /** ----------核心模块---------- */
    /** 日志管理 */
    static log = Logger;
    /** 全局消息 */
    static message = Message;
    /** 本地存储 */
    static storage = storage;
    /** 游戏时间管理 */
    static timer: TimerManager;
    /** 游戏音乐管理 */
    static audio: AudioManager;
    /** 二维界面管理 */
    static gui: LayerManager;
    /** 三维游戏世界管理 */
    static game: GameManager;

    /** ----------可选模块---------- */

    /** 多语言模块 */
    static language: LanguageManager;
    /** HTTP */
    static http: HttpRequest;
    /** ECS */
    static ecs: ECSRootSystem;
}