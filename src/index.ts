import {TranslateLoader, MissingTranslationHandler, MissingTranslationHandlerParams} from "@ngx-translate/core";
import {Observable} from "rxjs/internal/Observable";
import {map} from "rxjs/operators";
import {HttpClient} from "@angular/common/http";

function isInEditor() {
    try {
        return (window as any).bablic.preprocessI18nItem;
    } catch (e) {
        return false;
    }
}

class BablicTranslateLoader implements TranslateLoader {
    constructor(private http: HttpClient, private siteId: string, private isDebug: boolean) {

    }
    getTranslation(lang: string): any{
        if (isInEditor()) {
            return new Observable<any>((subscriber) => {
                // in editor, return empty
                subscriber.next({});
                subscriber.complete();
            });
        }
        const revision = localStorage && localStorage.getItem("_br");
        return this.http.get(`https://c.bablic.com${this.isDebug?"/test":""}/sites/${this.siteId}/ngx.${lang}.json${revision ? "?r=" + revision : ""}`).pipe(
            map((json) => {
                const empties = json["__"];
                if (empties) {
                    empties.forEach((emp) => {
                        json[emp] = emp;
                    });
                    delete json["__"];
                }
                return json;
            })
        );
    }
}

class BablicMissingTranslationHandler implements MissingTranslationHandler {
    private _timeout: any;
    private isInEditor: boolean;
    private lang: string;
    constructor(private http: HttpClient, private siteId: string, private isDebug: boolean) {
        this.isInEditor = isInEditor();
    }

    private bulk: Array<{key: string, params: any}> = [];

    handle(params: MissingTranslationHandlerParams): any {
        // return default
        const service = params.translateService;
        const lang = service.currentLang || service.defaultLang;
        this.lang = lang;
        const translations = service.store.translations[lang] || {};
        translations[params.key] = params.key;
        const parsed = service.getParsedResult(translations, params.key, params.interpolateParams);
        if (this.isInEditor) {
            // wrap with tags
            return (window as any).bablic.preprocessI18nItem(params.key, parsed);
        } else {
            // report this missing, and return parsed
            this.addMissing(params.key, params.interpolateParams);
            return parsed;
        }
    }

    addMissing(key: string, params: any) {
        this.bulk.push({key, params});
        clearTimeout(this._timeout);
        this._timeout = setTimeout(() => this.flush(), 1000);
    }

    async flush() {
        const tempBulk = this.bulk;
        this.bulk = [];
        try {
            const domain = this.isDebug ? "https://staging.bablic.com" : "https://e2.bablic.com";
            const updated = await this.http.post(`${domain}/api/engine/ngx-report?s=${this.siteId}&l=${this.lang}&uri=${encodeURIComponent(location.host + location.pathname)}`,
                tempBulk).toPromise();
            if (updated && updated.updated) {
                localStorage.setItem("_br", Date.now());
            }
        } catch (e) {
            console.error(e);
            this.bulk = [...tempBulk, ...this.bulk];
        }
    }


}

interface NgxTranslateConfig {
    loaderFactory: Function;
    missingTranslationHandlerFactory: Function;
}
export default function (siteId: string, isDebug = false): NgxTranslateConfig {
    return {
        loaderFactory: (http: HttpClient) => new BablicTranslateLoader(http, siteId, isDebug),
        missingTranslationHandlerFactory: (http: HttpClient) => new BablicMissingTranslationHandler(http, siteId, isDebug),
    };
}

