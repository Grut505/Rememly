import { articlesApi, CreateArticlePayload, UpdateArticlePayload } from '../api/articles'
import { Article } from '../api/types'
import { imageService } from './image.service'

class ArticlesService {
  async createArticle(
    auteur: string,
    texte: string,
    imageFile: File,
    assemblyState?: object,
    fullPage?: boolean
  ): Promise<Article> {
    const imageData = await imageService.processImage(imageFile)

    const payload: CreateArticlePayload = {
      auteur,
      texte,
      image: imageData,
      assembly_state: assemblyState || null,
      full_page: fullPage || false,
    }

    return articlesApi.create(payload)
  }

  async updateArticle(
    id: string,
    texte?: string,
    imageFile?: File,
    assemblyState?: object,
    fullPage?: boolean
  ): Promise<Article> {
    const payload: UpdateArticlePayload = {
      id,
      texte,
      assembly_state: assemblyState,
      full_page: fullPage,
    }

    if (imageFile) {
      payload.image = await imageService.processImage(imageFile)
    }

    return articlesApi.update(payload)
  }
}

export const articlesService = new ArticlesService()
