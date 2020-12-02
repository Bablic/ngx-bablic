import {TranslateLoader, MissingTranslationHandler, MissingTranslationHandlerParams} from "@ngx-translate/core";
import {Observable} from "rxjs/internal/Observable";
import {HttpClient} from "@angular/common/http";
import {Provider} from "@angular/core";

function isInEditor() {
    try {
        return (window as any).bablic.preprocessI18nItem;
    } catch (e) {
        return false;
    }
}

class BablicTranslateLoader implements TranslateLoader {
    constructor(private http: HttpClient, private siteId: string) {

    }
    getTranslation(lang: string): Observable<any>{
        if (isInEditor()) {
            return new Observable<any>((subscriber) => {
                // in editor, return empty
                subscriber.next({});
                subscriber.complete();
            });
        }
        return this.http.get(`https://c.bablic.com/sites/${this.siteId}/ngx.${lang}.json`);
    }
}

class BablicMissingTranslationHandler implements MissingTranslationHandler {
    private _timeout: any;
    private isInEditor: boolean;
    private lang: string;
    constructor(private http: HttpClient, private siteId: string) {
        this.isInEditor = isInEditor();
    }

    private bulk: Array<{key: string, params: any}> = [];

    handle(params: MissingTranslationHandlerParams): any {
        // return default
        const service = params.translateService;
        const lang = service.currentLang || service.defaultLang;
        this.lang = lang;
        const translations = service.store.translations[lang];
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
        this.bulk.add({key, params});
        clearTimeout(this._timeout);
        this._timeout = setTimeout(() => this.flush(), 1000);
    }

    async flush() {
        const tempBulk = this.bulk;
        this.bulk = [];
        try {
            await this.http.post(`https://e2.bablic.com/api/engine/ngx-report?s=${this.siteId}&l=${this.lang}&uri=${encodeURIComponent(location.href)}`,
                tempBulk).toPromise();
        } catch (e) {
            console.error(e);
            this.bulk = [...tempBulk, ...this.bulk];
        }
    }


}

interface NgxTranslateConfig {
    loader: Provider;
    missingTranslationHandler: Provider;
}
export default function (siteId: string): NgxTranslateConfig {
    return {
        loader: {
            provide: TranslateLoader,
            deps: [HttpClient],
            useFactory: (http: HttpClient) => new BablicTranslateLoader(http, siteId),
        },
        missingTranslationHandler: {
            provide: MissingTranslationHandler,
            deps: [HttpClient],
            useFactory: (http: HttpClient) => new BablicMissingTranslationHandler(http, siteId),
        }
    };
}
