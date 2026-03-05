export interface SuccesResponse<T> {
    mesaj: string;
    data: T;
    cod: number;
}


/**
 * Generează un răspuns standardizat pentru operațiunile CRUD
 * @param mesaj Mesajul de succes care va fi afișat utilizatorului (ex: "Actualizarea a fost efectuata cu succes")
 * @param entity Obiectul returnat din baza de date (ex: contactul creat/actualizat)
 */
export function returnValidResponse<T> (mesaj: string, entity: T): SuccesResponse<T> {
    return {
        mesaj:mesaj,
        data: entity,
        cod: 200
    }
}